import asyncio
import logging
import warnings

# Never hit a real LLM provider in tests. Any accidental model request (an
# agent that was not overridden with a fake model) fails loudly instead of
# reaching Google.
import pydantic_ai.models as _pydantic_ai_models
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

from app.ai import agents
from app.config import settings
from app.database import Base, get_db
from tests.ai_support import draft_model, review_model

_pydantic_ai_models.ALLOW_MODEL_REQUESTS = False

# The AI tests run with this fake key (never a real one) so the runner does not
# take the "disabled" branch, and with both cached agents overridden by a
# deterministic FunctionModel. Tests that need the disabled state or a failing
# model override this fixture locally (monkeypatch the key to "" or nest an
# ``agent.override(...)``), so no network is ever needed.
AI_FAKE_KEY = "test-key-cadence-offline"

# Suppress SQLAlchemy pool connection errors during test cleanup
logging.getLogger("sqlalchemy.pool.impl.AsyncAdaptedQueuePool").setLevel(
    logging.CRITICAL
)

# Filter out the specific async warning that occurs during testing
# This is a known issue with async SQLAlchemy connections in tests
warnings.filterwarnings(
    "ignore",
    message="coroutine.*was never awaited",
    category=RuntimeWarning,
    module=".*",
)

# Filter out connection cleanup warnings during test teardown
warnings.filterwarnings(
    "ignore",
    message=".*Event loop is closed.*",
    category=RuntimeWarning,
    module=".*",
)

# Filter out SQLAlchemy pool cleanup errors during testing
warnings.filterwarnings(
    "ignore",
    message=".*Exception terminating connection.*",
    category=Warning,
    module=".*",
)

# Suppress asyncpg connection closure warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="asyncpg.*")


@pytest.fixture(autouse=True)
def stub_ai(monkeypatch):
    """Make the AI features usable offline for every test.

    (a) Seed a fake ``GOOGLE_API_KEY`` on the settings object the runner reads,
    so the request never takes the "disabled" branch; and (b) override *both*
    cached agents (the same objects the routes call) with a deterministic
    ``FunctionModel`` returning a valid ``PlanReview`` / ``PlanDraft``. The
    override is entered on the cached singleton, so tests can nest their own
    ``agent.override(model=...)`` to exercise a failure mode.
    """
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", AI_FAKE_KEY)
    with (
        agents.build_review_agent().override(model=review_model()),
        agents.build_draft_agent().override(model=draft_model()),
    ):
        yield


@pytest.fixture(scope="session")
def postgres_container():
    """Start PostgreSQL container for tests."""
    with PostgresContainer("postgres:16") as postgres:
        yield postgres


@pytest.fixture
async def test_engine(postgres_container):
    """Create engine for each test to avoid event loop issues."""
    db_url = postgres_container.get_connection_url().replace("psycopg2", "asyncpg")
    engine = create_async_engine(
        db_url,
        echo=False,
        pool_pre_ping=False,  # Disable pre-ping to avoid cleanup issues
        pool_recycle=300,
        pool_timeout=10,
        pool_size=2,  # Smaller pool for tests
        max_overflow=5,
        connect_args={"server_settings": {"application_name": "pytest"}},
    )

    # Reset the schema for every test. The Postgres container is session-scoped,
    # so without drop_all, rows committed by an earlier test persist and Faker's
    # small email space can collide on users_email_key (flaky 500s).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Graceful engine disposal with error handling
    try:
        # Use a shorter timeout and handle cleanup gracefully
        await asyncio.wait_for(engine.dispose(), timeout=2.0)
    except TimeoutError:
        # If disposal times out, the connections will be forcefully closed
        pass
    except Exception:
        # Ignore other disposal errors during test cleanup
        logging.getLogger(__name__).debug("Engine disposal failed", exc_info=True)


@pytest.fixture
def session_factory(test_engine):
    """Session factory for tests that need direct database access."""
    return async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture
async def async_client(test_engine, session_factory):
    """Create async test client with test database."""

    async def get_test_db():
        async with session_factory() as session:
            yield session

    # Override the database dependency on every mounted sub-app: overrides are
    # per-app, so setting them on the root app alone leaves /app and /internal
    # pointing at the real database.
    from app.main import app as fastapi_app
    from app.main import app_api, internal_api

    fastapi_app.dependency_overrides[get_db] = get_test_db
    app_api.dependency_overrides[get_db] = get_test_db
    internal_api.dependency_overrides[get_db] = get_test_db

    # Also override the database engine at the module level to prevent conflicts
    import app.database

    original_engine = app.database.async_engine
    original_session_local = app.database.AsyncSessionLocal

    app.database.async_engine = test_engine
    app.database.AsyncSessionLocal = session_factory

    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app), base_url="http://localhost"
    ) as ac:
        yield ac

    # Cleanup - ensure proper order and error handling
    fastapi_app.dependency_overrides.clear()
    app_api.dependency_overrides.clear()
    internal_api.dependency_overrides.clear()

    # Restore original database setup
    app.database.async_engine = original_engine
    app.database.AsyncSessionLocal = original_session_local

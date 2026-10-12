"""Shared, offline helpers for the AI test suite.

Every AI test runs with ``pydantic_ai.models.ALLOW_MODEL_REQUESTS = False``
(see ``tests/conftest.py``), so a real provider is never reached. The autouse
``stub_ai`` fixture seeds a fake ``GOOGLE_API_KEY`` and overrides both cached
agents with the deterministic ``FunctionModel``s built here. A test that needs a
failure mode overrides the *same* cached agent locally with its own model; a
test that needs the disabled state monkeypatches the key back to ``""``.
"""

from __future__ import annotations

import uuid
from datetime import date

from pydantic_ai.messages import (
    ModelMessagesTypeAdapter,
    ModelResponse,
    ToolCallPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel
from sqlalchemy import func, select

from app.models import AiCall, Membership, Organization, User
from app.security import generate_jwt_token, hash_password

WEEK = date(2026, 1, 5)


def token(user: User) -> str:
    return generate_jwt_token({"sub": str(user.id)}, audience="app")


def auth(user: User) -> dict[str, str]:
    return {"Access-Token": f"Bearer {token(user)}"}


async def make_user(db, *, email: str | None = None) -> User:
    user = User(
        first_name="Ada",
        last_name="Lovelace",
        email=email or f"{uuid.uuid4().hex[:8]}@example.com",
        password=hash_password("x"),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def seed_org_with_member(session_factory, *, suspended: bool = False):
    """Create an org plus one active member; return ``(org, user, membership)``."""
    async with session_factory() as db:
        org = Organization(
            name="AI Org",
            slug=f"ai-{uuid.uuid4().hex[:12]}",
            is_suspended=suspended,
        )
        db.add(org)
        await db.flush()
        user = await make_user(db)
        membership = Membership(org_id=org.id, user_id=user.id, role="member")
        db.add(membership)
        await db.flush()
        await db.commit()
    return org, user, membership


async def ai_call_count(session_factory, *, org_id=None) -> int:
    async with session_factory() as db:
        stmt = select(func.count(AiCall.id))
        if org_id is not None:
            stmt = stmt.where(AiCall.org_id == org_id)
        return int(await db.scalar(stmt) or 0)


async def ai_call_statuses(session_factory) -> list[tuple[str, str | None]]:
    """Every ``ai_calls`` row as ``(status, error_class)``, oldest first."""
    async with session_factory() as db:
        rows = (
            await db.execute(select(AiCall).order_by(AiCall.created_at.asc()))
        ).scalars()
        return [(row.status, row.error_class) for row in rows]


async def latest_ai_call(session_factory) -> AiCall:
    async with session_factory() as db:
        return (
            await db.execute(select(AiCall).order_by(AiCall.created_at.desc()).limit(1))
        ).scalar_one()


def output_tool_name(info: AgentInfo) -> str:
    return info.output_tools[0].name if info.output_tools else "final_result"


def review_payload() -> dict:
    """A valid ``PlanReview`` (nothing to flag)."""
    return {"verdict": "approve", "summary": "Looks shippable.", "findings": []}


def draft_payload() -> dict:
    """A valid ``PlanDraft``."""
    return {
        "main": {"title": "Checkout handles expired cards", "why": "Users blocked"},
        "sub_goals": [],
        "gtm_goals": [],
        "left_out": [],
        "open_questions": [],
    }


def review_model(capture: list | None = None) -> FunctionModel:
    """A ``FunctionModel`` returning a valid review; optionally captures prompts."""

    def fn(messages, info):
        if capture is not None:
            capture.append(messages)
        return ModelResponse(
            parts=[ToolCallPart(output_tool_name(info), review_payload())]
        )

    return FunctionModel(fn)


def draft_model(capture: list | None = None) -> FunctionModel:
    """A ``FunctionModel`` returning a valid draft; optionally captures prompts."""

    def fn(messages, info):
        if capture is not None:
            capture.append(messages)
        return ModelResponse(
            parts=[ToolCallPart(output_tool_name(info), draft_payload())]
        )

    return FunctionModel(fn)


def prompt_text(messages) -> str:
    """The exact request text handed to the model (for prompt assertions)."""
    return ModelMessagesTypeAdapter.dump_json(messages).decode()

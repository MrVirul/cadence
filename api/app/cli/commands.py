import asyncio
import inspect
import secrets
from functools import partial, wraps

from pydantic import ValidationError
from sqlalchemy import select
from typer import BadParameter, Option, Typer

from app.cli.schemas import UserCreate
from app.database import AsyncSessionLocal, async_engine
from app.models import User
from app.security import hash_password
from app.seed import (
    DEMO_PASSWORD,
    render_logins_table,
    seed_demo,
    write_demo_logins,
)


class AsyncTyper(Typer):
    @staticmethod
    def maybe_run_async(decorator, f):
        if inspect.iscoroutinefunction(f):

            @wraps(f)
            def runner(*args, **kwargs):
                # Close the shared session and dispose the engine's pool inside
                # the same event loop asyncio.run creates, so pooled asyncpg
                # connections are returned before the loop's greenlet is
                # finalized (otherwise the GC terminates them post-loop and
                # SQLAlchemy warns about non-checked-in connections).
                async def main():
                    try:
                        return await f(*args, **kwargs)
                    finally:
                        await session.close()
                        await async_engine.dispose()

                return asyncio.run(main())

            decorator(runner)
        else:
            decorator(f)
        return f

    def callback(self, *args, **kwargs):
        decorator = super().callback(*args, **kwargs)
        return partial(self.maybe_run_async, decorator)

    def command(self, *args, **kwargs):
        decorator = super().command(*args, **kwargs)
        return partial(self.maybe_run_async, decorator)


session = AsyncSessionLocal()
cli = AsyncTyper()


@cli.callback()
def main():
    """Cadence management CLI."""
    # Present so Typer always runs in subcommand mode (`manage.py user-create`),
    # even while there is only a single command registered.


@cli.command()
async def create_user(
    first_name: str = Option(...),
    last_name: str = Option(...),
    email: str = Option(...),
    password: str = Option(None, help="Login password. Generated if not given."),
    admin: bool = Option(False, "--admin", help="Grant admin privileges."),
):
    """Create a user.

    The login password is generated unless provided with --password.
    Pass --admin to grant admin privileges.
    """
    try:
        data = UserCreate(first_name=first_name, last_name=last_name, email=email)
    except ValidationError as e:
        raise BadParameter("; ".join(err["msg"] for err in e.errors()))

    existing = (
        (await session.execute(select(User).where(User.email == data.email)))
        .scalars()
        .first()
    )
    if existing:
        raise BadParameter(f"User with email '{data.email}' already exists.")

    generated = password is None
    if generated:
        password = secrets.token_urlsafe(12)

    user = User(
        **data.model_dump(),
        password=hash_password(password),
        is_active=True,
        is_admin=admin,
    )
    session.add(user)
    await session.commit()
    print(f"{'Admin' if admin else 'User'} created: ", user.id)
    if generated:
        print("Generated password: ", password)


@cli.command("seed-demo")
async def seed_demo_command(
    reset: bool = Option(
        False,
        "--reset",
        help="Delete demo orgs/users and recreate them. Never touches other rows.",
    ),
):
    """Seed the deterministic demo dataset (AGENTS.md §10).

    Without --reset this is idempotent: if the demo orgs already exist it prints
    a notice and changes nothing. With --reset it deletes only the demo orgs and
    users (by slug/email) and recreates the full dataset.
    """
    result = await seed_demo(session, reset=reset)
    if result.created:
        print(
            "Seeded: "
            f"{result.orgs} orgs, {result.users} users, {result.teams} teams, "
            f"{result.plans} plans, {result.ai_calls} ai_calls."
        )
    else:
        print("Demo data already exists; nothing was changed. Use --reset to rebuild.")

    table = render_logins_table(result.logins)
    print()
    print(f"Demo logins (password: {DEMO_PASSWORD})")
    print(table)
    path = write_demo_logins(result.logins)
    print(f"\nWrote {path}")

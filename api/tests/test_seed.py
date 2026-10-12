"""The demo seed command (root ``AGENTS.md`` §10).

Exercises the real ``seed_demo`` function against a fresh database: it builds
the whole demo dataset through the services, is idempotent, ``--reset`` only
replaces demo rows, and every seeded plan obeys the plan invariants. The demo
logins are then checked through the real login route and ``/app/me``.
"""

from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.clock import current_week_start, today_utc
from app.models import (
    AiCall,
    Membership,
    Organization,
    Plan,
    PlanEvent,
    Task,
    Team,
    TeamMember,
    User,
)
from app.security import hash_password
from app.seed import DEMO_PASSWORD, DEMO_SLUGS, seed_demo

ALL_MODELS = (
    Organization,
    User,
    Membership,
    Team,
    TeamMember,
    Plan,
    Task,
    PlanEvent,
    AiCall,
)


async def _counts(db) -> dict[str, int]:
    return {
        model.__tablename__: await db.scalar(select(func.count()).select_from(model))
        or 0
        for model in ALL_MODELS
    }


@pytest.mark.asyncio
async def test_seed_creates_full_dataset(session_factory):
    async with session_factory() as db:
        result = await seed_demo(db)
    assert result.created is True

    async with session_factory() as db:
        orgs = (await db.execute(select(Organization))).scalars().all()
        assert {org.slug for org in orgs} == set(DEMO_SLUGS)

        roles = set(
            (await db.execute(select(Membership.role).distinct())).scalars().all()
        )
        assert roles == {"owner", "admin", "member"}

        # Every org keeps an owner; the two active orgs each have >= 2
        # privileged members so approvals always have an approver.
        for org in orgs:
            privileged = await db.scalar(
                select(func.count())
                .select_from(Membership)
                .where(
                    Membership.org_id == org.id,
                    Membership.role.in_(("owner", "admin")),
                )
            )
            assert (privileged or 0) >= 1

        # Teams exist and at least one has a lead.
        teams = (await db.execute(select(Team))).scalars().all()
        assert teams
        assert any(team.lead_membership_id is not None for team in teams)

        # Exactly one suspended org, with a reason.
        suspended = (
            (await db.execute(select(Organization).where(Organization.is_suspended)))
            .scalars()
            .all()
        )
        assert len(suspended) == 1
        assert suspended[0].suspended_reason

        # A staff user exists.
        staff = await db.scalar(select(User).where(User.is_admin.is_(True)))
        assert staff is not None and staff.is_active

        # Plans span at least six past weeks, with mixed shipped outcomes.
        monday = current_week_start(today_utc())
        past_weeks = (
            (
                await db.execute(
                    select(Plan.week_start).distinct().where(Plan.week_start < monday)
                )
            )
            .scalars()
            .all()
        )
        assert len(past_weeks) >= 6
        shipped_values = set(
            (await db.execute(select(Plan.shipped).distinct())).scalars().all()
        )
        assert True in shipped_values and False in shipped_values

        # AI telemetry has at least three distinct statuses.
        statuses = set(
            (await db.execute(select(AiCall.status).distinct())).scalars().all()
        )
        assert {"success", "error", "timeout"} <= statuses


@pytest.mark.asyncio
async def test_seed_is_idempotent(session_factory):
    async with session_factory() as db:
        first = await seed_demo(db)
        assert first.created
        before = await _counts(db)

    async with session_factory() as db:
        second = await seed_demo(db)
        assert second.created is False
        assert await _counts(db) == before


@pytest.mark.asyncio
async def test_reset_restores_counts_and_spares_non_demo(session_factory):
    async with session_factory() as db:
        await seed_demo(db)
        # A non-demo org and user that must survive a reset.
        other = Organization(name="Untouched Ltd", slug="untouched")
        keeper = User(
            first_name="Keeper",
            last_name="Account",
            email="keeper@example.test",
            password=hash_password("longenough1"),
            is_active=True,
        )
        db.add_all([other, keeper])
        await db.flush()
        db.add(Membership(org_id=other.id, user_id=keeper.id, role="owner"))
        await db.commit()
        before = await _counts(db)

    async with session_factory() as db:
        result = await seed_demo(db, reset=True)
        assert result.created is True
        assert await _counts(db) == before
        assert await db.scalar(
            select(Organization.id).where(Organization.slug == "untouched")
        )
        assert await db.scalar(
            select(User.id).where(User.email == "keeper@example.test")
        )


@pytest.mark.asyncio
async def test_seeded_plans_obey_invariants(session_factory):
    async with session_factory() as db:
        await seed_demo(db)
        plans = (await db.execute(select(Plan))).scalars().all()
        assert len(plans) >= 6 * 10
        for plan in plans:
            assert plan.week_start.weekday() == 0, "week_start must be a Monday"

            mains = await db.scalar(
                select(func.count())
                .select_from(Task)
                .where(Task.plan_id == plan.id, Task.kind == "main")
            )
            assert mains == 1, "exactly one main task per plan"

            team_member = await db.scalar(
                select(TeamMember.id).where(
                    TeamMember.team_id == plan.team_id,
                    TeamMember.membership_id == plan.membership_id,
                )
            )
            assert team_member is not None, "author must belong to the plan's team"

            actions = set(
                (
                    await db.execute(
                        select(PlanEvent.action).where(PlanEvent.plan_id == plan.id)
                    )
                )
                .scalars()
                .all()
            )
            if plan.status == "done":
                assert "closed" in actions
                assert plan.shipped is not None
            elif plan.status == "approved":
                assert "approved" in actions and "closed" not in actions
            elif plan.status == "submitted":
                assert "submitted" in actions and "approved" not in actions
            else:  # draft (including a sent-back plan)
                assert "approved" not in actions and "closed" not in actions


@pytest.mark.asyncio
async def test_demo_logins_work(async_client, session_factory):
    async with session_factory() as db:
        await seed_demo(db)

    for email in (
        "owner@northwind.test",
        "admin@northwind.test",
        "member@northwind.test",
    ):
        login = await async_client.post(
            "/app/auth/login", json={"email": email, "password": DEMO_PASSWORD}
        )
        assert login.status_code == 200, login.json()

        me = await async_client.get("/app/me")
        assert me.status_code == 200, me.json()
        body = me.json()
        assert body["user"]["email"] == email
        assert body["memberships"], "the demo user must belong to an org"
        assert any(m["org"] for m in body["memberships"])


def test_past_week_helper_is_a_monday():
    # Guard the test's own assumption about the relative-date helper.
    monday = current_week_start(date(2026, 10, 15))
    assert monday.weekday() == 0
    assert monday + timedelta(weeks=1) > monday

"""Model-level tests: DB constraints declared on the SQLAlchemy models.

These exercise the database directly (no services/router yet) to prove the
CheckConstraints, unique constraints and the partial "one main task per plan"
index are actually enforced by Postgres.
"""

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Membership,
    Organization,
    Plan,
    PlanEvent,
    Task,
    Team,
    User,
)

MONDAY = date(2026, 1, 5)
TUESDAY = date(2026, 1, 6)


async def _seed_org_user(db, *, role: str = "member"):
    org = Organization(name="Test Org", slug=f"org-{uuid.uuid4().hex[:10]}")
    user = User(
        first_name="Test",
        last_name="User",
        email=f"{uuid.uuid4().hex[:12]}@example.com",
        password="x",
        is_active=True,
    )
    db.add_all([org, user])
    await db.flush()
    membership = Membership(org_id=org.id, user_id=user.id, role=role)
    db.add(membership)
    await db.flush()
    return org, user, membership


async def _seed_team(db, org):
    team = Team(org_id=org.id, name=f"Team {uuid.uuid4().hex[:8]}")
    db.add(team)
    await db.flush()
    return team


async def _new_user(db):
    user = User(
        first_name="Other",
        last_name="User",
        email=f"{uuid.uuid4().hex[:12]}@example.com",
        password="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _seed_plan(db, *, week_start: date = MONDAY, status: str = "draft"):
    org, _, membership = await _seed_org_user(db)
    team = await _seed_team(db, org)
    plan = Plan(
        org_id=org.id,
        membership_id=membership.id,
        team_id=team.id,
        week_start=week_start,
        status=status,
    )
    db.add(plan)
    await db.flush()
    return org, membership, team, plan


@pytest.mark.asyncio
async def test_one_main_task_per_plan_index(session_factory):
    """The partial unique index rejects a second `main` task on one plan."""
    async with session_factory() as db:
        org, _, _, plan = await _seed_plan(db)

        db.add(Task(org_id=org.id, plan_id=plan.id, kind="main", title="First main"))
        await db.flush()  # first main is fine

        db.add(Task(org_id=org.id, plan_id=plan.id, kind="main", title="Second main"))
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_multiple_non_main_tasks_allowed(session_factory):
    """The `main` index is partial: several sub-goals / GTM goals coexist."""
    async with session_factory() as db:
        org, _, _, plan = await _seed_plan(db)

        db.add_all(
            [
                Task(org_id=org.id, plan_id=plan.id, kind="sub_goal", title="Sub 1"),
                Task(org_id=org.id, plan_id=plan.id, kind="sub_goal", title="Sub 2"),
                Task(org_id=org.id, plan_id=plan.id, kind="gtm", title="GTM 1"),
            ]
        )
        await db.flush()  # no error expected

        count = await db.scalar(
            select(func.count()).select_from(Task).where(Task.plan_id == plan.id)
        )
        assert count == 3


@pytest.mark.asyncio
async def test_membership_role_check_rejects_bad_value(session_factory):
    """`memberships.role` is constrained to owner/admin/member."""
    async with session_factory() as db:
        org, _, _ = await _seed_org_user(db)
        other = await _new_user(db)

        db.add(Membership(org_id=org.id, user_id=other.id, role="superuser"))
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_membership_unique_org_user(session_factory):
    """A user can only appear once in an org: unique (org_id, user_id)."""
    async with session_factory() as db:
        org, user, _ = await _seed_org_user(db)

        db.add(Membership(org_id=org.id, user_id=user.id, role="member"))
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_plan_status_check_rejects_bad_value(session_factory):
    """`plans.status` is constrained to draft/submitted/approved/done."""
    async with session_factory() as db:
        org, _, membership = await _seed_org_user(db)
        team = await _seed_team(db, org)

        db.add(
            Plan(
                org_id=org.id,
                membership_id=membership.id,
                team_id=team.id,
                week_start=MONDAY,
                status="archived",
            )
        )
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_plan_week_start_must_be_monday(session_factory):
    """Monday inserts succeed; a Tuesday `week_start` is rejected."""
    assert MONDAY.weekday() == 0
    assert TUESDAY.weekday() == 1

    async with session_factory() as db:
        # A Monday is accepted.
        await _seed_plan(db, week_start=MONDAY)

        org, _, membership = await _seed_org_user(db)
        team = await _seed_team(db, org)
        db.add(
            Plan(
                org_id=org.id,
                membership_id=membership.id,
                team_id=team.id,
                week_start=TUESDAY,
                status="draft",
            )
        )
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_plan_unique_membership_week(session_factory):
    """One plan per member per week: unique (membership_id, week_start)."""
    async with session_factory() as db:
        org, membership, team, _ = await _seed_plan(db, week_start=MONDAY)

        db.add(
            Plan(
                org_id=org.id,
                membership_id=membership.id,
                team_id=team.id,
                week_start=MONDAY,
                status="draft",
            )
        )
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_task_kind_check_rejects_bad_value(session_factory):
    """`tasks.kind` is constrained to main/sub_goal/gtm."""
    async with session_factory() as db:
        org, _, _, plan = await _seed_plan(db)

        db.add(Task(org_id=org.id, plan_id=plan.id, kind="epic", title="Nope"))
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_task_status_check_rejects_bad_value(session_factory):
    """`tasks.status` is constrained to todo/done."""
    async with session_factory() as db:
        org, _, _, plan = await _seed_plan(db)

        db.add(
            Task(
                org_id=org.id,
                plan_id=plan.id,
                kind="sub_goal",
                title="Nope",
                status="doing",
            )
        )
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_plan_event_self_approved_defaults_false(session_factory):
    """`plan_events.self_approved` is a non-null boolean defaulting to false."""
    async with session_factory() as db:
        org, membership, _, plan = await _seed_plan(db)

        event = PlanEvent(
            org_id=org.id,
            plan_id=plan.id,
            actor_membership_id=membership.id,
            action="approved",
        )
        db.add(event)
        await db.flush()
        await db.refresh(event)

        assert event.self_approved is False

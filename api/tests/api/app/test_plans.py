"""Plans, tasks and the plan state machine (docs/DATA_MODEL.md §"Plan state machine").

Covers every edge of the state machine (valid and invalid), the self-approval
rules, week validation (with the injected "today"), content locking, task
ticking rules, task id ownership on PUT, the read-then-act 404/403 split, the
one-plan-per-week conflict and its concurrency, and the ``plan_events`` trail.
"""

import asyncio
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from faker import Faker
from sqlalchemy import select

from app.api.app.org_access import get_today
from app.main import app_api
from app.models import (
    Membership,
    Organization,
    Plan,
    PlanEvent,
    Task,
    Team,
    TeamMember,
    User,
)
from app.security import generate_jwt_token, hash_password

fake = Faker()

# Pin "today" so week validation is exact: 2026-01-07 is a Wednesday, so the
# current week starts Monday 2026-01-05.
FIXED_TODAY = date(2026, 1, 7)
WEEK = date(2026, 1, 5)


@pytest.fixture(autouse=True)
def pin_today():
    # The customer routes live on the mounted ``/app`` sub-application, so the
    # override must be registered on that app (not the root app in ``app.main``).
    app_api.dependency_overrides[get_today] = lambda: FIXED_TODAY
    yield
    app_api.dependency_overrides.pop(get_today, None)


def _token(user: User) -> str:
    return generate_jwt_token({"sub": str(user.id)}, audience="app")


def _auth(user: User) -> dict[str, str]:
    return {"Access-Token": f"Bearer {_token(user)}"}


async def _make_user(db) -> User:
    user = User(
        first_name=fake.first_name(),
        last_name=fake.last_name(),
        email=fake.email().lower(),
        password=hash_password("x"),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _seed_org(db, *roles: str):
    """Create an org with one user+membership per role; return (org, members)."""
    org = Organization(name=fake.company(), slug=f"pl-{uuid.uuid4().hex[:12]}")
    db.add(org)
    await db.flush()
    members = []
    for role in roles:
        user = await _make_user(db)
        membership = Membership(org_id=org.id, user_id=user.id, role=role)
        db.add(membership)
        await db.flush()
        members.append((role, user, membership))
    return org, members


def _pick(members, role: str, index: int = 0):
    return [entry for entry in members if entry[0] == role][index]


async def _make_team(db, org, name="Platform", lead_membership_id=None) -> Team:
    team = Team(org_id=org.id, name=name, lead_membership_id=lead_membership_id)
    db.add(team)
    await db.flush()
    return team


async def _join(db, org, team, membership) -> None:
    db.add(TeamMember(org_id=org.id, team_id=team.id, membership_id=membership.id))
    await db.flush()


async def _seed_plan(
    db,
    org,
    membership,
    team,
    *,
    week=WEEK,
    status="draft",
    main_title="Ship the weekly plan",
    main_why="Teams need a shared commitment",
    decided_by=None,
) -> Plan:
    now = datetime.now(UTC)
    plan = Plan(
        org_id=org.id,
        membership_id=membership.id,
        team_id=team.id,
        week_start=week,
        status=status,
        submitted_at=now if status != "draft" else None,
        decided_at=now if status in ("approved", "done") else None,
        decided_by_membership_id=decided_by.id if decided_by is not None else None,
    )
    db.add(plan)
    await db.flush()
    if main_title is not None:
        db.add(
            Task(
                org_id=org.id,
                plan_id=plan.id,
                kind="main",
                title=main_title,
                why=main_why,
            )
        )
        await db.flush()
    return plan


async def _events(db, plan_id) -> list[PlanEvent]:
    result = await db.execute(
        select(PlanEvent)
        .where(PlanEvent.plan_id == plan_id)
        .order_by(PlanEvent.created_at, PlanEvent.id)
    )
    return list(result.scalars().all())


def _create_body(team_id, week=WEEK, tasks=None):
    return {
        "week_start": week.isoformat(),
        "team_id": str(team_id),
        "tasks": tasks
        if tasks is not None
        else [{"kind": "main", "title": "Ship checkout", "why": "Users are blocked"}],
    }


# --- happy path & events ---------------------------------------------------


@pytest.mark.asyncio
async def test_full_lifecycle_and_events(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member")
        _, author_user, author = _pick(members, "member", 0)
        _, approver_user, approver = _pick(members, "member", 1)
        team = await _make_team(db, org, lead_membership_id=approver.id)
        await _join(db, org, team, author)
        await _join(db, org, team, approver)
        org_id, team_id = org.id, team.id
        await db.commit()

    # author creates a draft (incomplete main is fine to save)
    created = await async_client.post(
        f"/app/orgs/{org_id}/plans",
        json=_create_body(team_id, tasks=[{"kind": "main", "title": "T", "why": None}]),
        headers=_auth(author_user),
    )
    assert created.status_code == 201, created.text
    plan_id = created.json()["id"]
    assert created.json()["status"] == "draft"

    # complete the main task, then submit
    updated = await async_client.put(
        f"/app/orgs/{org_id}/plans/{plan_id}",
        json=_create_body(team_id)["tasks"]
        and {
            "tasks": [
                {"kind": "main", "title": "Ship checkout", "why": "Users are blocked"}
            ]
        },
        headers=_auth(author_user),
    )
    assert updated.status_code == 200, updated.text

    submitted = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/submit", headers=_auth(author_user)
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "submitted"
    assert submitted.json()["submitted_at"] is not None

    approved = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/approve", headers=_auth(approver_user)
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["decided_by"]["membership_id"] == str(approver.id)

    closed = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/close",
        json={"shipped": True},
        headers=_auth(author_user),
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "done"
    assert closed.json()["shipped"] is True
    assert closed.json()["closed_at"] is not None

    async with session_factory() as db:
        plan = await db.get(Plan, uuid.UUID(plan_id))
        assert plan.status == "done" and plan.shipped is True
        events = await _events(db, plan.id)
        assert [e.action for e in events] == ["submitted", "approved", "closed"]
        assert [e.actor_membership_id for e in events] == [
            author.id,
            approver.id,
            author.id,
        ]
        assert all(e.self_approved is False for e in events)


# --- invalid transitions ---------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_transitions_return_409(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, admin_user, _ = _pick(members, "owner")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        draft = await _seed_plan(db, org, author, team, status="draft")
        submitted = await _seed_plan(
            db, org, author, team, week=WEEK - timedelta(weeks=1), status="submitted"
        )
        approved = await _seed_plan(
            db, org, author, team, week=WEEK - timedelta(weeks=2), status="approved"
        )
        org_id = org.id
        draft_id, submitted_id, approved_id = draft.id, submitted.id, approved.id
        await db.commit()

    base = f"/app/orgs/{org_id}/plans"

    async def call(plan_id, action, *, body=None, user=author_user):
        return await async_client.post(
            f"{base}/{plan_id}/{action}", json=body, headers=_auth(user)
        )

    assert (await call(draft_id, "withdraw")).status_code == 409
    assert (await call(draft_id, "approve", user=admin_user)).status_code == 409
    assert (await call(draft_id, "close", body={"shipped": True})).status_code == 409
    assert (await call(submitted_id, "submit")).status_code == 409
    assert (
        await call(submitted_id, "close", body={"shipped": True})
    ).status_code == 409
    assert (await call(approved_id, "submit")).status_code == 409
    assert (await call(approved_id, "withdraw")).status_code == 409
    for response in [
        await call(draft_id, "approve", user=admin_user),
        await call(approved_id, "submit"),
    ]:
        assert response.json()["code"] == "invalid_transition"


# --- withdraw & send-back return to draft ----------------------------------


@pytest.mark.asyncio
async def test_withdraw_returns_to_draft_and_author_can_edit(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    withdrawn = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/withdraw", headers=_auth(author_user)
    )
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json()["status"] == "draft"
    assert withdrawn.json()["submitted_at"] is None

    editable = await async_client.put(
        f"/app/orgs/{org_id}/plans/{plan_id}",
        json={"tasks": [{"kind": "main", "title": "New title", "why": "New why"}]},
        headers=_auth(author_user),
    )
    assert editable.status_code == 200, editable.text
    assert editable.json()["tasks"][0]["title"] == "New title"

    async with session_factory() as db:
        assert [e.action for e in await _events(db, plan_id)] == ["withdrawn"]


@pytest.mark.asyncio
async def test_send_back_returns_to_draft_and_author_can_edit(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        _, owner_user, owner = _pick(members, "owner")
        team = await _make_team(db, org, lead_membership_id=owner.id)
        await _join(db, org, team, author)
        await _join(db, org, team, owner)
        plan = await _seed_plan(db, org, author, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    sent_back = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/send-back",
        json={"comment": "Make the main task checkable"},
        headers=_auth(owner_user),
    )
    assert sent_back.status_code == 200, sent_back.text
    body = sent_back.json()
    assert body["status"] == "draft"
    assert body["decision_comment"] == "Make the main task checkable"

    editable = await async_client.put(
        f"/app/orgs/{org_id}/plans/{plan_id}",
        json={"tasks": [{"kind": "main", "title": "Checkable", "why": "Impact"}]},
        headers=_auth(author_user),
    )
    assert editable.status_code == 200

    async with session_factory() as db:
        events = await _events(db, plan_id)
        assert [e.action for e in events] == ["sent_back"]
        assert events[0].comment == "Make the main task checkable"


@pytest.mark.asyncio
async def test_send_back_requires_non_empty_comment(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, _, author_membership = _pick(members, "member")
        _, owner_user, owner = _pick(members, "owner")
        team = await _make_team(db, org, lead_membership_id=owner.id)
        await _join(db, org, team, author_membership)
        plan = await _seed_plan(db, org, author_membership, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    for payload in ({"comment": ""}, {"comment": "   "}):
        response = await async_client.post(
            f"/app/orgs/{org_id}/plans/{plan_id}/send-back",
            json=payload,
            headers=_auth(owner_user),
        )
        assert response.status_code == 422, response.text
        assert response.json()["code"] == "validation_error"

    async with session_factory() as db:
        plan = await db.get(Plan, plan_id)
        assert plan.status == "submitted"  # unchanged


@pytest.mark.asyncio
async def test_approve_clears_old_decision_comment(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        _, owner_user, owner = _pick(members, "owner")
        team = await _make_team(db, org, lead_membership_id=owner.id)
        await _join(db, org, team, author)
        await _join(db, org, team, owner)
        plan = await _seed_plan(db, org, author, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/send-back",
        json={"comment": "Fix it"},
        headers=_auth(owner_user),
    )
    await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/submit", headers=_auth(author_user)
    )
    approved = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/approve", headers=_auth(owner_user)
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["decision_comment"] is None


@pytest.mark.asyncio
async def test_content_locked_after_submit(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    response = await async_client.put(
        f"/app/orgs/{org_id}/plans/{plan_id}",
        json={"tasks": [{"kind": "main", "title": "Hack", "why": "Hack"}]},
        headers=_auth(author_user),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "invalid_transition"


# --- task ticking ----------------------------------------------------------


@pytest.mark.asyncio
async def test_task_ticking_allowed_in_draft_and_approved_not_done(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="draft")
        task = (
            (await db.execute(select(Task).where(Task.plan_id == plan.id)))
            .scalars()
            .one()
        )
        org_id, plan_id, task_id = org.id, plan.id, task.id
        await db.commit()

    url = f"/app/orgs/{org_id}/tasks/{task_id}"
    done = await async_client.patch(
        url, json={"status": "done"}, headers=_auth(author_user)
    )
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "done" and done.json()["done_at"] is not None

    todo = await async_client.patch(
        url, json={"status": "todo"}, headers=_auth(author_user)
    )
    assert todo.status_code == 200
    assert todo.json()["done_at"] is None

    # drive to approved, ticking still works
    async with session_factory() as db:
        plan = await db.get(Plan, plan_id)
        plan.status = "approved"
        await db.commit()
    assert (
        await async_client.patch(
            url, json={"status": "done"}, headers=_auth(author_user)
        )
    ).status_code == 200

    # drive to done: read-only
    async with session_factory() as db:
        plan = await db.get(Plan, plan_id)
        plan.status = "done"
        await db.commit()
    locked = await async_client.patch(
        url, json={"status": "todo"}, headers=_auth(author_user)
    )
    assert locked.status_code == 409
    assert locked.json()["code"] == "invalid_transition"


@pytest.mark.asyncio
async def test_task_tick_by_non_author_403_and_other_org_404(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member")
        _, author_user, author = _pick(members, "member", 0)
        _, teammate_user, teammate = _pick(members, "member", 1)
        _, owner_user, _owner = _pick(members, "owner")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        await _join(db, org, team, teammate)
        plan = await _seed_plan(db, org, author, team, status="draft")
        task = (
            (await db.execute(select(Task).where(Task.plan_id == plan.id)))
            .scalars()
            .one()
        )
        org_id, task_id = org.id, task.id
        await db.commit()

    url = f"/app/orgs/{org_id}/tasks/{task_id}"

    # A plain teammate cannot read the plan (members do not see each other's
    # plans) -> the read gate answers 404 before any actor check.
    unreadable = await async_client.patch(
        url, json={"status": "done"}, headers=_auth(teammate_user)
    )
    assert unreadable.status_code == 404
    assert unreadable.json()["code"] == "not_found"

    # An org owner *can* read the plan but is not its author -> 403.
    forbidden = await async_client.patch(
        url, json={"status": "done"}, headers=_auth(owner_user)
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "forbidden"

    missing = await async_client.patch(
        f"/app/orgs/{org_id}/tasks/{uuid.uuid4()}",
        json={"status": "done"},
        headers=_auth(author_user),
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"


# --- week validation -------------------------------------------------------


@pytest.mark.asyncio
async def test_create_week_validation(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        org_id, team_id = org.id, team.id
        await db.commit()

    url = f"/app/orgs/{org_id}/plans"
    headers = _auth(author_user)

    # Tuesday -> not a Monday
    assert (
        await async_client.post(
            url,
            json=_create_body(team_id, week=WEEK + timedelta(days=1)),
            headers=headers,
        )
    ).status_code == 422
    # past week
    assert (
        await async_client.post(
            url,
            json=_create_body(team_id, week=WEEK - timedelta(weeks=1)),
            headers=headers,
        )
    ).status_code == 422
    # 5 weeks ahead
    assert (
        await async_client.post(
            url,
            json=_create_body(team_id, week=WEEK + timedelta(weeks=5)),
            headers=headers,
        )
    ).status_code == 422
    # exactly 4 weeks ahead is allowed
    ok = await async_client.post(
        url, json=_create_body(team_id, week=WEEK + timedelta(weeks=4)), headers=headers
    )
    assert ok.status_code == 201, ok.text


@pytest.mark.asyncio
async def test_one_plan_per_week_conflicts(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        org_id, team_id = org.id, team.id
        await db.commit()

    url = f"/app/orgs/{org_id}/plans"
    headers = _auth(author_user)
    first = await async_client.post(url, json=_create_body(team_id), headers=headers)
    assert first.status_code == 201
    second = await async_client.post(url, json=_create_body(team_id), headers=headers)
    assert second.status_code == 409
    assert second.json()["code"] == "conflict"


@pytest.mark.asyncio
async def test_concurrent_creates_one_201_one_409(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        org_id, team_id = org.id, team.id
        await db.commit()

    url = f"/app/orgs/{org_id}/plans"
    headers = _auth(author_user)
    body = _create_body(team_id)
    responses = await asyncio.gather(
        async_client.post(url, json=body, headers=headers),
        async_client.post(url, json=body, headers=headers),
    )
    assert sorted(r.status_code for r in responses) == [201, 409]
    assert any(r.json().get("code") == "conflict" for r in responses)

    async with session_factory() as db:
        count = len(
            (await db.execute(select(Plan).where(Plan.org_id == org_id)))
            .scalars()
            .all()
        )
        assert count == 1


@pytest.mark.asyncio
async def test_concurrent_submits_one_200_one_409(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="draft")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    url = f"/app/orgs/{org_id}/plans/{plan_id}/submit"
    headers = _auth(author_user)
    responses = await asyncio.gather(
        async_client.post(url, headers=headers),
        async_client.post(url, headers=headers),
    )
    assert sorted(r.status_code for r in responses) == [200, 409]

    async with session_factory() as db:
        plan = await db.get(Plan, plan_id)
        assert plan.status == "submitted"
        events = await _events(db, plan_id)
        assert [e.action for e in events] == ["submitted"]


# --- submit validations ----------------------------------------------------


@pytest.mark.asyncio
async def test_submit_requires_main_and_why(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        no_main = await _seed_plan(db, org, author, team, main_title=None)
        no_why = await _seed_plan(
            db, org, author, team, week=WEEK - timedelta(weeks=1), main_why=None
        )
        org_id = org.id
        no_main_id, no_why_id = no_main.id, no_why.id
        await db.commit()

    for plan_id in (no_main_id, no_why_id):
        response = await async_client.post(
            f"/app/orgs/{org_id}/plans/{plan_id}/submit",
            headers=_auth(author_user),
        )
        assert response.status_code == 422, response.text
        assert response.json()["code"] == "validation_error"


@pytest.mark.asyncio
async def test_submit_past_week_422(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        past = await _seed_plan(
            db, org, author, team, week=WEEK - timedelta(weeks=1), status="draft"
        )
        org_id, plan_id = org.id, past.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/submit", headers=_auth(author_user)
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_submit_after_leaving_team_403(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="draft")
        # Author leaves the team before submitting.
        link = (
            await db.execute(
                select(TeamMember).where(
                    TeamMember.team_id == team.id,
                    TeamMember.membership_id == author.id,
                )
            )
        ).scalar_one()
        await db.delete(link)
        org_id, plan_id = org.id, plan.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/submit", headers=_auth(author_user)
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


# --- read-then-act ---------------------------------------------------------


@pytest.mark.asyncio
async def test_read_access_404_403_split(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "admin", "member", "member")
        _, owner_user, _ = _pick(members, "owner")
        _, admin_user, _ = _pick(members, "admin")
        _, author_user, author = _pick(members, "member", 0)
        _, teammate_user, teammate = _pick(members, "member", 1)
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        await _join(db, org, team, teammate)
        outside_team = await _make_team(db, org, name="Other")
        outside_team.lead_membership_id = teammate.id
        plan = await _seed_plan(db, org, author, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    url = f"/app/orgs/{org_id}/plans/{plan_id}"
    # teammate (in team, not author/lead/admin) cannot READ -> 404
    assert (
        await async_client.get(url, headers=_auth(teammate_user))
    ).status_code == 404
    # admin and owner can read -> 200
    assert (await async_client.get(url, headers=_auth(admin_user))).status_code == 200
    assert (await async_client.get(url, headers=_auth(owner_user))).status_code == 200
    # author can read
    assert (await async_client.get(url, headers=_auth(author_user))).status_code == 200

    # teammate can read (admin) but is not the author -> 403 on edit
    forbidden = await async_client.put(
        url,
        json={"tasks": [{"kind": "main", "title": "x", "why": "y"}]},
        headers=_auth(admin_user),
    )
    # admin is not the author -> 403 (can read, cannot act)
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_lead_of_another_team_gets_404(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member")
        _, _, author = _pick(members, "member", 0)
        _, other_lead_user, other_lead = _pick(members, "member", 1)
        team = await _make_team(db, org, name="Mine")
        await _join(db, org, team, author)
        other = await _make_team(
            db, org, name="Other", lead_membership_id=other_lead.id
        )
        await _join(db, org, other, other_lead)
        plan = await _seed_plan(db, org, author, team)
        org_id, plan_id = org.id, plan.id
        await db.commit()

    response = await async_client.get(
        f"/app/orgs/{org_id}/plans/{plan_id}", headers=_auth(other_lead_user)
    )
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


@pytest.mark.asyncio
async def test_team_lead_approves_teammate_plan(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, _, author = _pick(members, "member")
        _, lead_user, lead = _pick(members, "owner")
        team = await _make_team(db, org, lead_membership_id=lead.id)
        await _join(db, org, team, author)
        await _join(db, org, team, lead)
        plan = await _seed_plan(db, org, author, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    approved = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/approve", headers=_auth(lead_user)
    )
    assert approved.status_code == 200, approved.text

    async with session_factory() as db:
        events = await _events(db, plan_id)
        assert events[-1].action == "approved"
        assert events[-1].self_approved is False
        assert events[-1].actor_membership_id == lead.id


# --- self-approval ---------------------------------------------------------


@pytest.mark.asyncio
async def test_self_approval_blocked_when_another_approver_exists(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        # `member` is the team lead and authors their own plan; the owner is
        # another eligible approver, so self-approval must be blocked.
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org, lead_membership_id=author.id)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/approve", headers=_auth(author_user)
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"

    async with session_factory() as db:
        assert await _events(db, plan_id) == []


@pytest.mark.asyncio
async def test_solo_owner_self_approval_records_self_approved(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, owner_user, owner = _pick(members, "owner")
        # Team has no lead; the owner is the only privileged member.
        team = await _make_team(db, org)
        await _join(db, org, team, owner)
        plan = await _seed_plan(db, org, owner, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    approved = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/approve", headers=_auth(owner_user)
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    async with session_factory() as db:
        events = await _events(db, plan_id)
        assert len(events) == 1
        assert events[0].self_approved is True
        assert events[0].actor_membership_id == owner.id


@pytest.mark.asyncio
async def test_plain_member_author_cannot_approve_own_plan(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        _, _, owner = _pick(members, "owner")
        team = await _make_team(db, org, lead_membership_id=owner.id)
        await _join(db, org, team, author)
        await _join(db, org, team, owner)
        plan = await _seed_plan(db, org, author, team, status="submitted")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_id}/plans/{plan_id}/approve", headers=_auth(author_user)
    )
    assert response.status_code == 403


# --- PUT task diffing & limits --------------------------------------------


@pytest.mark.asyncio
async def test_put_diffing_keeps_ids_and_deletes_omitted(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="draft")
        main = (
            (await db.execute(select(Task).where(Task.plan_id == plan.id)))
            .scalars()
            .one()
        )
        db.add(Task(org_id=org.id, plan_id=plan.id, kind="sub_goal", title="Drop me"))
        await db.flush()
        org_id, plan_id, main_id = org.id, plan.id, main.id
        await db.commit()

    response = await async_client.put(
        f"/app/orgs/{org_id}/plans/{plan_id}",
        json={
            "tasks": [
                {"id": str(main_id), "kind": "main", "title": "Updated", "why": "Why"},
                {"kind": "gtm", "title": "Changelog entry"},
            ]
        },
        headers=_auth(author_user),
    )
    assert response.status_code == 200, response.text
    tasks = response.json()["tasks"]
    assert {t["title"] for t in tasks} == {"Updated", "Changelog entry"}
    updated_main = next(t for t in tasks if t["kind"] == "main")
    assert updated_main["id"] == str(main_id)  # id stays stable


@pytest.mark.asyncio
async def test_put_task_from_another_org_is_404_and_writes_nothing(
    async_client, session_factory
):
    async with session_factory() as db:
        org_a, members_a = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members_a, "member")
        team_a = await _make_team(db, org_a)
        await _join(db, org_a, team_a, author)
        plan = await _seed_plan(db, org_a, author, team_a, status="draft")

        org_b, members_b = await _seed_org(db, "owner", "member")
        _, _, author_b = _pick(members_b, "member")
        team_b = await _make_team(db, org_b)
        await _join(db, org_b, team_b, author_b)
        plan_b = await _seed_plan(db, org_b, author_b, team_b, main_title="Foreign")
        foreign_task = (
            (await db.execute(select(Task).where(Task.plan_id == plan_b.id)))
            .scalars()
            .one()
        )
        org_a_id, plan_a_id = org_a.id, plan.id
        foreign_task_id = foreign_task.id
        await db.commit()

    response = await async_client.put(
        f"/app/orgs/{org_a_id}/plans/{plan_a_id}",
        json={
            "tasks": [
                {"id": str(foreign_task_id), "kind": "sub_goal", "title": "Hijack"}
            ]
        },
        headers=_auth(author_user),
    )
    assert response.status_code == 404, response.text

    async with session_factory() as db:
        tasks = (
            (await db.execute(select(Task).where(Task.plan_id == plan_a_id)))
            .scalars()
            .all()
        )
        assert [t.title for t in tasks] == ["Ship the weekly plan"]


@pytest.mark.asyncio
async def test_put_more_than_five_subgoals_is_422_not_500(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="draft")
        org_id, plan_id = org.id, plan.id
        await db.commit()

    response = await async_client.put(
        f"/app/orgs/{org_id}/plans/{plan_id}",
        json={
            "tasks": [
                {"kind": "main", "title": "Main", "why": "Why"},
                *[{"kind": "sub_goal", "title": f"Sub {i}"} for i in range(6)],
            ]
        },
        headers=_auth(author_user),
    )
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_error"


@pytest.mark.asyncio
async def test_two_main_tasks_is_422(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        org_id, team_id = org.id, team.id
        await db.commit()

    response = await async_client.post(
        f"/app/orgs/{org_id}/plans",
        json=_create_body(
            team_id,
            tasks=[
                {"kind": "main", "title": "A", "why": "x"},
                {"kind": "main", "title": "B", "why": "y"},
            ],
        ),
        headers=_auth(author_user),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


# --- server-controlled fields ---------------------------------------------


@pytest.mark.asyncio
async def test_request_body_cannot_set_server_fields(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        plan = await _seed_plan(db, org, author, team, status="draft")
        org_id, team_id, plan_id = org.id, team.id, plan.id
        await db.commit()

    create = await async_client.post(
        f"/app/orgs/{org_id}/plans",
        json={**_create_body(team_id), "status": "approved"},
        headers=_auth(author_user),
    )
    assert create.status_code == 422
    assert create.json()["code"] == "validation_error"

    create_b = await async_client.post(
        f"/app/orgs/{org_id}/plans",
        json={**_create_body(team_id), "org_id": str(org_id)},
        headers=_auth(author_user),
    )
    assert create_b.status_code == 422

    update = await async_client.put(
        f"/app/orgs/{org_id}/plans/{plan_id}",
        json={
            "tasks": [{"kind": "main", "title": "x", "why": "y"}],
            "membership_id": str(author.id),
        },
        headers=_auth(author_user),
    )
    assert update.status_code == 422


# --- create team ownership -------------------------------------------------


@pytest.mark.asyncio
async def test_create_with_team_not_member_read_then_act(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "admin", "member")
        _, admin_user, _ = _pick(members, "admin")
        _, member_user, _ = _pick(members, "member")
        team = await _make_team(db, org)  # nobody is on it
        _org_b, members_b = await _seed_org(db, "owner")
        _, _, _ = _pick(members_b, "owner")
        other_team = await _make_team(db, _org_b, name="Foreign")
        org_id, team_id = org.id, team.id
        foreign_team_id = other_team.id
        await db.commit()

    url = f"/app/orgs/{org_id}/plans"
    # admin can read the team but is not on it -> 403
    admin_response = await async_client.post(
        url, json=_create_body(team_id), headers=_auth(admin_user)
    )
    assert admin_response.status_code == 403
    assert admin_response.json()["code"] == "forbidden"

    # plain member cannot read the team -> 404
    member_response = await async_client.post(
        url, json=_create_body(team_id), headers=_auth(member_user)
    )
    assert member_response.status_code == 404
    assert member_response.json()["code"] == "not_found"

    # a team from another org -> 404
    foreign_response = await async_client.post(
        url, json=_create_body(foreign_team_id), headers=_auth(member_user)
    )
    assert foreign_response.status_code == 404


# --- list visibility -------------------------------------------------------


@pytest.mark.asyncio
async def test_list_visibility_and_counts(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member", "member")
        _, admin_user, _ = _pick(members, "owner")
        _, lead_user, lead = _pick(members, "member", 0)
        _, member_user, member = _pick(members, "member", 1)
        _, _, outsider = _pick(members, "member", 2)

        team = await _make_team(db, org, lead_membership_id=lead.id)
        await _join(db, org, team, lead)
        await _join(db, org, team, member)

        mine = await _seed_plan(db, org, member, team, week=WEEK)
        # a second plan in the same team by the lead (different week)
        theirs = await _seed_plan(
            db, org, lead, team, week=WEEK - timedelta(weeks=1), status="submitted"
        )
        outsider_direct = Team(org_id=org.id, name="Direct")
        db.add(outsider_direct)
        await db.flush()
        await _join(db, org, outsider_direct, outsider)
        await _seed_plan(
            db,
            org,
            outsider,
            outsider_direct,
            week=WEEK - timedelta(weeks=2),
            status="draft",
        )
        org_id = org.id
        await db.commit()

    url = f"/app/orgs/{org_id}/plans"
    as_member = (await async_client.get(url, headers=_auth(member_user))).json()
    assert {item["id"] for item in as_member["items"]} == {str(mine.id)}

    as_lead = (await async_client.get(url, headers=_auth(lead_user))).json()
    assert {item["id"] for item in as_lead["items"]} == {str(mine.id), str(theirs.id)}

    as_admin = (await async_client.get(url, headers=_auth(admin_user))).json()
    assert as_admin["total"] == 3

    only_mine = (
        await async_client.get(f"{url}?mine=true", headers=_auth(admin_user))
    ).json()
    assert only_mine["total"] == 0

    # counts, not text
    item = next(i for i in as_member["items"] if i["id"] == str(mine.id))
    assert item["tasks_total"] == 1 and item["tasks_done"] == 0
    assert "tasks" not in item


@pytest.mark.asyncio
async def test_list_week_filter(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, author_user, author = _pick(members, "member")
        team = await _make_team(db, org)
        await _join(db, org, team, author)
        await _seed_plan(db, org, author, team, week=WEEK)
        await _seed_plan(
            db, org, author, team, week=WEEK - timedelta(weeks=1), status="submitted"
        )
        org_id = org.id
        await db.commit()

    response = await async_client.get(
        f"/app/orgs/{org_id}/plans?week={WEEK.isoformat()}",
        headers=_auth(author_user),
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1

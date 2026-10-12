"""Team week & history (docs/API.md §"Teams").

The lead/admin week view and history are read-only, metadata-only surfaces:

- access is read-then-act: admin/owner and the team's lead get ``200``; a plain
  member *of* the team can read the team but not its week, so ``403``; an org
  member outside the team gets an indistinguishable ``404`` (and a cross-org
  caller is a ``404`` from org-context resolution);
- a week row exists for every *current* team member, even with no plan;
- only plans filed under *this* team count (a member in two teams files one
  plan under one of them), so the other team reads as ``not_started``;
- history covers past weeks only, newest first, paged, with a page-level
  shipped rate;
- neither response ever carries task text (title/why), only status/counters.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from faker import Faker
from sqlalchemy import delete

from app.api.app.org_access import get_today
from app.main import app_api
from app.models import (
    Membership,
    Organization,
    Plan,
    Task,
    Team,
    TeamMember,
    User,
)
from app.security import generate_jwt_token, hash_password

fake = Faker()

# Pin "today" so "current week" is exact: 2026-01-07 is a Wednesday, so the
# current week starts Monday 2026-01-05.
FIXED_TODAY = date(2026, 1, 7)
WEEK = date(2026, 1, 5)
LAST_WEEK = WEEK - timedelta(weeks=1)
TWO_WEEKS_AGO = WEEK - timedelta(weeks=2)
NEXT_WEEK = WEEK + timedelta(weeks=1)

# Sentinels: the week/history responses must never contain this text.
TITLE = "Confidential main task title"
WHY = "Confidential why text"


@pytest.fixture(autouse=True)
def pin_today():
    # The customer routes live on the mounted ``/app`` sub-application, so the
    # override must be registered there (see test_plans.py).
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
    org = Organization(name=fake.company(), slug=f"tw-{uuid.uuid4().hex[:12]}")
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
    tasks=(("main", "done"), ("sub_goal", "todo")),
    shipped=None,
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
        closed_at=now if status == "done" else None,
        shipped=shipped,
    )
    db.add(plan)
    await db.flush()
    for index, (kind, task_status) in enumerate(tasks):
        db.add(
            Task(
                org_id=org.id,
                plan_id=plan.id,
                kind=kind,
                title=f"{TITLE} {index}",
                why=WHY if kind == "main" else None,
                status=task_status,
                position=index,
            )
        )
    await db.flush()
    return plan


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_week_access_by_role(async_client, session_factory):
    """Lead/admin 200; teammate non-lead 403; outsider 404; cross-org 404."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "admin", "member", "member")
        _, owner, _ = _pick(members, "owner")
        _, admin, _ = _pick(members, "admin")
        _, lead, lead_membership = _pick(members, "member", 0)
        _, teammate, teammate_membership = _pick(members, "member", 1)
        outsider = await _make_user(db)
        db.add(Membership(org_id=org.id, user_id=outsider.id, role="member"))
        await db.flush()

        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        await _join(db, org, team, lead_membership)
        await _join(db, org, team, teammate_membership)

        _org_b, members_b = await _seed_org(db, "owner")
        _, foreign_user, _ = _pick(members_b, "owner")
        org_id, team_id = org.id, team.id
        await db.commit()

    url = f"/app/orgs/{org_id}/teams/{team_id}/week"
    for user in (lead, admin, owner):
        response = await async_client.get(url, headers=_auth(user))
        assert response.status_code == 200, (user.email, response.text)
        assert response.json()["week_start"] == WEEK.isoformat()

    forbidden = await async_client.get(url, headers=_auth(teammate))
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "forbidden"

    hidden = await async_client.get(url, headers=_auth(outsider))
    assert hidden.status_code == 404
    assert hidden.json()["code"] == "not_found"

    cross_org = await async_client.get(url, headers=_auth(foreign_user))
    assert cross_org.status_code == 404
    assert cross_org.json()["code"] == "not_found"


@pytest.mark.asyncio
async def test_history_access_by_role(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member")
        _, lead, lead_membership = _pick(members, "member", 0)
        _, teammate, teammate_membership = _pick(members, "member", 1)
        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        await _join(db, org, team, lead_membership)
        await _join(db, org, team, teammate_membership)
        org_id, team_id = org.id, team.id
        await db.commit()

    url = f"/app/orgs/{org_id}/teams/{team_id}/history"
    assert (await async_client.get(url, headers=_auth(lead))).status_code == 200
    forbidden = await async_client.get(url, headers=_auth(teammate))
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "forbidden"


@pytest.mark.asyncio
async def test_week_rejects_non_monday_and_defaults_to_current(
    async_client, session_factory
):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, lead, lead_membership = _pick(members, "owner")
        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        await _join(db, org, team, lead_membership)
        org_id, team_id = org.id, team.id
        await db.commit()

    url = f"/app/orgs/{org_id}/teams/{team_id}/week"

    default = await async_client.get(url, headers=_auth(lead))
    assert default.status_code == 200
    assert default.json()["week_start"] == WEEK.isoformat()

    explicit = await async_client.get(
        f"{url}?week={LAST_WEEK.isoformat()}", headers=_auth(lead)
    )
    assert explicit.status_code == 200
    assert explicit.json()["week_start"] == LAST_WEEK.isoformat()

    # 2026-01-06 is a Tuesday.
    bad = await async_client.get(
        f"{url}?week={date(2026, 1, 6).isoformat()}", headers=_auth(lead)
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "validation_error"


# ---------------------------------------------------------------------------
# Week rows
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_week_rows_status_counts_and_empty_row(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member", "member")
        _, lead, lead_membership = _pick(members, "owner")
        _, alice, alice_membership = _pick(members, "member", 0)
        _, bob, bob_membership = _pick(members, "member", 1)
        _, carol, carol_membership = _pick(members, "member", 2)
        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        for membership in (
            lead_membership,
            alice_membership,
            bob_membership,
            carol_membership,
        ):
            await _join(db, org, team, membership)

        # Alice: submitted, 2 tasks, 1 done. Bob: no plan. Carol: approved, all
        # done, not yet shipped.
        alice_plan = await _seed_plan(
            db,
            org,
            alice_membership,
            team,
            status="submitted",
            tasks=(("main", "done"), ("sub_goal", "todo")),
        )
        carol_plan = await _seed_plan(
            db,
            org,
            carol_membership,
            team,
            status="approved",
            tasks=(("main", "done"), ("sub_goal", "done"), ("gtm", "done")),
        )
        org_id, team_id = org.id, team.id
        alice_plan_id = alice_plan.id
        carol_plan_id = carol_plan.id
        await db.commit()

    response = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_id}/week", headers=_auth(lead)
    )
    assert response.status_code == 200, response.text
    rows = {row["membership_id"]: row for row in response.json()["rows"]}
    assert len(rows) == 4

    alice = rows[str(alice_membership.id)]
    assert alice["plan_id"] == str(alice_plan_id)
    assert alice["status"] == "submitted"
    assert (alice["tasks_done"], alice["tasks_total"]) == (1, 2)
    assert alice["shipped"] is None

    bob = rows[str(bob_membership.id)]
    assert bob["plan_id"] is None
    assert bob["status"] == "not_started"
    assert (bob["tasks_done"], bob["tasks_total"]) == (0, 0)
    assert bob["shipped"] is None

    carol = rows[str(carol_membership.id)]
    assert carol["plan_id"] == str(carol_plan_id)
    assert carol["status"] == "approved"
    assert (carol["tasks_done"], carol["tasks_total"]) == (3, 3)


@pytest.mark.asyncio
async def test_plan_filed_under_other_team_reads_as_not_started(
    async_client, session_factory
):
    """A member in two teams files one plan; the other team shows not_started."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, lead, lead_membership = _pick(members, "owner")
        _, _, dev_membership = _pick(members, "member")
        team_a = await _make_team(
            db, org, name="Alpha", lead_membership_id=lead_membership.id
        )
        team_b = await _make_team(
            db, org, name="Beta", lead_membership_id=lead_membership.id
        )
        for team in (team_a, team_b):
            await _join(db, org, team, lead_membership)
            await _join(db, org, team, dev_membership)
        # The single weekly plan is filed under team A.
        await _seed_plan(db, org, dev_membership, team_a, status="submitted")
        org_id = org.id
        team_a_id, team_b_id = team_a.id, team_b.id
        dev_membership_id = dev_membership.id
        await db.commit()

    as_a = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_a_id}/week", headers=_auth(lead)
    )
    row_a = {r["membership_id"]: r for r in as_a.json()["rows"]}[str(dev_membership_id)]
    assert row_a["status"] == "submitted"
    assert row_a["plan_id"] is not None

    as_b = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_b_id}/week", headers=_auth(lead)
    )
    row_b = {r["membership_id"]: r for r in as_b.json()["rows"]}[str(dev_membership_id)]
    assert row_b["status"] == "not_started"
    assert row_b["plan_id"] is None


@pytest.mark.asyncio
async def test_removed_member_disappears_from_week(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, lead, lead_membership = _pick(members, "owner")
        _, _, dev_membership = _pick(members, "member")
        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        await _join(db, org, team, lead_membership)
        await _join(db, org, team, dev_membership)
        org_id, team_id = org.id, team.id
        dev_membership_id = dev_membership.id
        await db.commit()

    url = f"/app/orgs/{org_id}/teams/{team_id}/week"
    before = await async_client.get(url, headers=_auth(lead))
    assert str(dev_membership_id) in {r["membership_id"] for r in before.json()["rows"]}

    async with session_factory() as db:
        await db.execute(
            delete(TeamMember).where(TeamMember.membership_id == dev_membership_id)
        )
        await db.commit()

    after = await async_client.get(url, headers=_auth(lead))
    assert str(dev_membership_id) not in {
        r["membership_id"] for r in after.json()["rows"]
    }


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_counts_ordering_and_paging(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member", "member")
        _, lead, lead_membership = _pick(members, "owner")
        _, _, a_membership = _pick(members, "member", 0)
        _, _, b_membership = _pick(members, "member", 1)
        _, _, c_membership = _pick(members, "member", 2)
        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        for membership in (lead_membership, a_membership, b_membership, c_membership):
            await _join(db, org, team, membership)

        # Two weeks ago: one done+shipped plan.
        await _seed_plan(
            db, org, a_membership, team, week=TWO_WEEKS_AGO, status="done", shipped=True
        )
        # Last week: submitted + approved (not yet shipped).
        await _seed_plan(
            db, org, a_membership, team, week=LAST_WEEK, status="submitted"
        )
        await _seed_plan(db, org, b_membership, team, week=LAST_WEEK, status="approved")
        # Current and future weeks must be excluded from history.
        await _seed_plan(db, org, a_membership, team, week=WEEK, status="draft")
        await _seed_plan(db, org, b_membership, team, week=NEXT_WEEK, status="draft")
        org_id, team_id = org.id, team.id
        await db.commit()

    response = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_id}/history", headers=_auth(lead)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2  # two past weeks with plans
    assert [item["week_start"] for item in body["items"]] == [
        LAST_WEEK.isoformat(),
        TWO_WEEKS_AGO.isoformat(),
    ]
    last_week, two_weeks = body["items"]
    assert (last_week["total"], last_week["submitted_count"]) == (2, 1)
    assert (last_week["approved_count"], last_week["done_count"]) == (1, 0)
    assert last_week["shipped_count"] == 0
    assert (two_weeks["total"], two_weeks["done_count"]) == (1, 1)
    assert two_weeks["shipped_count"] == 1

    paged = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_id}/history?limit=1&offset=1",
        headers=_auth(lead),
    )
    assert paged.json()["total"] == 2
    assert [item["week_start"] for item in paged.json()["items"]] == [
        TWO_WEEKS_AGO.isoformat()
    ]


@pytest.mark.asyncio
async def test_history_shipped_rate_over_page(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member", "member")
        _, lead, lead_membership = _pick(members, "owner")
        _, _, a_membership = _pick(members, "member", 0)
        _, _, b_membership = _pick(members, "member", 1)
        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        for membership in (lead_membership, a_membership, b_membership):
            await _join(db, org, team, membership)

        # Last week: 2 plans, 1 shipped. Two weeks ago: 1 plan, 1 shipped.
        await _seed_plan(
            db, org, a_membership, team, week=LAST_WEEK, status="done", shipped=True
        )
        await _seed_plan(
            db, org, b_membership, team, week=LAST_WEEK, status="done", shipped=False
        )
        await _seed_plan(
            db, org, a_membership, team, week=TWO_WEEKS_AGO, status="done", shipped=True
        )
        org_id, team_id = org.id, team.id
        await db.commit()

    response = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_id}/history", headers=_auth(lead)
    )
    body = response.json()
    assert body["shipped_rate"] == round(2 / 3, 4)


@pytest.mark.asyncio
async def test_history_empty_returns_null_rate(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, lead, lead_membership = _pick(members, "owner")
        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        await _join(db, org, team, lead_membership)
        org_id, team_id = org.id, team.id
        await db.commit()

    response = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_id}/history", headers=_auth(lead)
    )
    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "total": 0,
        "limit": 12,
        "offset": 0,
        "shipped_rate": None,
    }


# ---------------------------------------------------------------------------
# Privacy
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_week_and_history_never_leak_task_text(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, lead, lead_membership = _pick(members, "owner")
        _, _, dev_membership = _pick(members, "member")
        team = await _make_team(db, org, lead_membership_id=lead_membership.id)
        await _join(db, org, team, lead_membership)
        await _join(db, org, team, dev_membership)
        await _seed_plan(
            db, org, dev_membership, team, week=LAST_WEEK, status="done", shipped=True
        )
        await _seed_plan(db, org, dev_membership, team, week=WEEK, status="submitted")
        org_id, team_id = org.id, team.id
        await db.commit()

    week = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_id}/week", headers=_auth(lead)
    )
    history = await async_client.get(
        f"/app/orgs/{org_id}/teams/{team_id}/history", headers=_auth(lead)
    )
    assert week.status_code == 200 and history.status_code == 200
    for response in (week, history):
        assert TITLE not in response.text
        assert WHY not in response.text

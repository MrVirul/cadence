"""Tenancy matrix: four assertions for every /app/orgs/{org_id}/... route.

For each entry in ``tests/tenancy_registry`` (docs/API.md rules 1-5, 25-26):

(a) a user from another org on org A's url gets 404 with a body identical to a
    nonexistent org;
(b) a member of a suspended org gets 403 ``org_suspended``;
(c) a role below the minimum gets 403 ``forbidden``;
(d) the minimum-role user succeeds.

Plus the route-coverage test that fails when a new org-scoped route is not
registered (rule 3), and its mirror that fails when a registry entry points at
a route that does not exist.
"""

import uuid
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe

import pytest
from faker import Faker
from starlette.routing import Mount

from app.models import (
    Invite,
    Membership,
    Organization,
    Plan,
    Task,
    Team,
    TeamMember,
    User,
)
from app.security import generate_jwt_token, hash_password
from tests.tenancy_registry import TENANCY_REGISTRY, World

fake = Faker()


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


def _token(user: User) -> str:
    return generate_jwt_token({"sub": str(user.id)}, audience="app")


async def _make_world(session_factory) -> World:
    async with session_factory() as db:
        org_a = Organization(name="Org A", slug=f"a-{uuid.uuid4().hex[:12]}")
        db.add(org_a)
        await db.flush()

        owner_a = await _make_user(db)
        admin_a = await _make_user(db)
        member_a = await _make_user(db)
        team_member_a = await _make_user(db)
        target_a = await _make_user(db)
        memberships_a = {
            "owner": Membership(org_id=org_a.id, user_id=owner_a.id, role="owner"),
            "admin": Membership(org_id=org_a.id, user_id=admin_a.id, role="admin"),
            "member": Membership(org_id=org_a.id, user_id=member_a.id, role="member"),
            "team_member": Membership(
                org_id=org_a.id, user_id=team_member_a.id, role="member"
            ),
            "target": Membership(org_id=org_a.id, user_id=target_a.id, role="member"),
        }
        for membership in memberships_a.values():
            db.add(membership)
        await db.flush()

        # team_a contains ``team_member`` (its lead) and ``target``; ``member``
        # is deliberately left out so it can play the outsider in the matrix.
        team_a = Team(
            org_id=org_a.id,
            name="Org A Team",
            lead_membership_id=memberships_a["team_member"].id,
        )
        db.add(team_a)
        await db.flush()
        for membership in (memberships_a["team_member"], memberships_a["target"]):
            db.add(
                TeamMember(
                    org_id=org_a.id, team_id=team_a.id, membership_id=membership.id
                )
            )
        await db.flush()

        invite = Invite(
            org_id=org_a.id,
            token=token_urlsafe(32),
            role="member",
            created_by_membership_id=memberships_a["admin"].id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(invite)
        await db.flush()

        # Plan fixtures. ``plan_team_a`` is a team ``member_a`` belongs to
        # (lead: ``team_member_a``), so ``member_a`` may author plans in it.
        # One plan per week: draft (this week), submitted (last week) and
        # approved (two weeks ago).
        plan_team_a = Team(
            org_id=org_a.id,
            name="Plans Team",
            lead_membership_id=memberships_a["team_member"].id,
        )
        db.add(plan_team_a)
        await db.flush()
        for membership in (memberships_a["team_member"], memberships_a["member"]):
            db.add(
                TeamMember(
                    org_id=org_a.id,
                    team_id=plan_team_a.id,
                    membership_id=membership.id,
                )
            )
        await db.flush()

        today = datetime.now(UTC).date()
        this_week = today - timedelta(days=today.weekday())
        draft_plan = Plan(
            org_id=org_a.id,
            membership_id=memberships_a["member"].id,
            team_id=plan_team_a.id,
            week_start=this_week,
            status="draft",
        )
        submitted_plan = Plan(
            org_id=org_a.id,
            membership_id=memberships_a["member"].id,
            team_id=plan_team_a.id,
            week_start=this_week - timedelta(weeks=1),
            status="submitted",
            submitted_at=datetime.now(UTC),
        )
        approved_plan = Plan(
            org_id=org_a.id,
            membership_id=memberships_a["member"].id,
            team_id=plan_team_a.id,
            week_start=this_week - timedelta(weeks=2),
            status="approved",
            submitted_at=datetime.now(UTC),
            decided_at=datetime.now(UTC),
            decided_by_membership_id=memberships_a["team_member"].id,
        )
        db.add_all([draft_plan, submitted_plan, approved_plan])
        await db.flush()
        draft_task = Task(
            org_id=org_a.id,
            plan_id=draft_plan.id,
            kind="main",
            title="Ship the weekly plan",
            why="Teams need a shared commitment",
        )
        db.add(draft_task)
        await db.flush()

        org_b = Organization(name="Org B", slug=f"b-{uuid.uuid4().hex[:12]}")
        db.add(org_b)
        await db.flush()
        member_b = await _make_user(db)
        db.add(Membership(org_id=org_b.id, user_id=member_b.id, role="member"))
        await db.flush()

        org_c = Organization(
            name="Org C", slug=f"c-{uuid.uuid4().hex[:12]}", is_suspended=True
        )
        db.add(org_c)
        await db.flush()
        member_c = await _make_user(db)
        db.add(Membership(org_id=org_c.id, user_id=member_c.id, role="member"))
        await db.flush()

        await db.commit()
        return World(
            org_a_id=org_a.id,
            org_b_id=org_b.id,
            org_c_id=org_c.id,
            owner_a_token=_token(owner_a),
            admin_a_token=_token(admin_a),
            member_a_token=_token(member_a),
            member_b_token=_token(member_b),
            member_c_token=_token(member_c),
            target_membership_id=memberships_a["target"].id,
            invite_id=invite.id,
            team_a_id=team_a.id,
            team_member_a_token=_token(team_member_a),
            team_member_a_membership_id=memberships_a["team_member"].id,
            plan_team_a_id=plan_team_a.id,
            draft_plan_id=draft_plan.id,
            draft_task_id=draft_task.id,
            submitted_plan_id=submitted_plan.id,
            approved_plan_id=approved_plan.id,
            next_week_start=(this_week + timedelta(weeks=1)).isoformat(),
        )


def _auth(token: str) -> dict[str, str]:
    return {"Access-Token": f"Bearer {token}"}


def _url(case, org_id: uuid.UUID, world: World) -> str:
    substitutions = {"org_id": str(org_id)}
    substitutions.update(case.ids_for_a(world))
    return case.path.format(**substitutions)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case", TENANCY_REGISTRY, ids=lambda case: f"{case.method} {case.path}"
)
async def test_tenancy_matrix(case, async_client, session_factory):
    world = await _make_world(session_factory)
    body = case.body_for_a(world)

    # (a) A user from another org on org A's url -> 404, and the body is
    # IDENTICAL to the one for a nonexistent org id (rules 2, 4). The phantom
    # call keeps org A's resource ids: org-context resolution happens before any
    # resource id is looked up.
    phantom_org_id = uuid.uuid4()
    real = await async_client.request(
        case.method,
        _url(case, world.org_a_id, world),
        headers=_auth(world.member_b_token),
        json=body,
    )
    phantom = await async_client.request(
        case.method,
        _url(case, phantom_org_id, world),
        headers=_auth(world.member_b_token),
        json=body,
    )
    assert real.status_code == phantom.status_code == 404
    assert real.json() == phantom.json()
    assert real.json()["code"] == "not_found"

    # (b) A member of a suspended org gets 403 org_suspended (rule 5).
    suspended = await async_client.request(
        case.method,
        _url(case, world.org_c_id, world),
        headers=_auth(world.member_c_token),
        json=body,
    )
    assert suspended.status_code == 403
    assert suspended.json()["code"] == "org_suspended"

    # (c) A plain member who is below the minimum role — or, on a team-scoped
    # route, simply not in the team — gets ``outsider_status``: 403 forbidden
    # for role-gated routes, 404 not_found where team existence must stay
    # hidden (permission matrix).
    if case.min_role != "member":
        low_role = await async_client.request(
            case.method,
            _url(case, world.org_a_id, world),
            headers=_auth(world.member_a_token),
            json=body,
        )
        assert low_role.status_code == case.outsider_status, (
            case.method,
            case.path,
            low_role.text,
        )
        expected_code = {404: "not_found", 403: "forbidden"}[case.outsider_status]
        assert low_role.json()["code"] == expected_code

    # (e) A plain member who IS in the team gets ``team_member_status``: 200
    # where teammates may read, 403 where only admins may write.
    if case.team_member_status is not None:
        teammate = await async_client.request(
            case.method,
            _url(case, world.org_a_id, world),
            headers=_auth(world.team_member_a_token),
            json=body,
        )
        assert teammate.status_code == case.team_member_status, (
            case.method,
            case.path,
            teammate.text,
        )

    # (d) The minimum-role user succeeds (rules 1, 26).
    token = {
        "member": world.member_a_token,
        "admin": world.admin_a_token,
        "owner": world.owner_a_token,
    }[case.min_role]
    ok = await async_client.request(
        case.method,
        _url(case, world.org_a_id, world),
        headers=_auth(token),
        json=body,
    )
    assert ok.status_code in (200, 201, 204), ok.text


def _mounted_app_routes() -> list:
    from app.main import app

    mounts = [
        route
        for route in app.routes
        if isinstance(route, Mount) and route.path == "/app"
    ]
    assert len(mounts) == 1, "expected exactly one /app mount"
    return list(mounts[0].app.routes)


def test_route_coverage_org_scoped_routes_registered():
    """Rule 3: a new /app/orgs/{org_id}/... route must not ship untested."""
    registered = {(case.method, case.path) for case in TENANCY_REGISTRY}
    missing = []
    for route in _mounted_app_routes():
        path = getattr(route, "path", "")
        if not path.startswith("/orgs/{org_id}"):
            continue
        full_path = "/app" + path
        for method in getattr(route, "methods", frozenset()):
            if method == "HEAD":  # FastAPI auto-adds HEAD for GET routes
                continue
            if (method, full_path) not in registered:
                missing.append(f"{method} {full_path}")
    assert not missing, (
        f"org-scoped routes missing from tenancy registry: {sorted(missing)}"
    )


def test_registry_entries_exist_in_app():
    """Every registry entry must resolve to a real route (guards against typos)."""
    actual = set()
    for route in _mounted_app_routes():
        path = getattr(route, "path", "")
        if not path.startswith("/orgs/{org_id}"):
            continue
        for method in getattr(route, "methods", frozenset()):
            if method != "HEAD":
                actual.add((method, "/app" + path))
    for case in TENANCY_REGISTRY:
        assert (case.method, case.path) in actual, (
            f"registry entry is not a real route: {case.method} {case.path}"
        )

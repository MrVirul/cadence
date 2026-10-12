"""Tests for the ``/internal`` platform-staff API surface (docs/API.md §"/internal")."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from starlette.routing import Mount

from app.models import (
    AiCall,
    Membership,
    Organization,
    Plan,
    StaffAction,
    Team,
    TeamMember,
    User,
)
from app.security import JWT_AUDIENCE_INTERNAL, generate_jwt_token, hash_password
from tests.internal_registry import (
    EXCLUDED_INTERNAL_PATHS,
    INTERNAL_REGISTRY,
    InternalRouteCase,
    InternalWorld,
    build_internal_world,
)

OPENAPI_INTERNAL_PATHS: frozenset[str] = frozenset(
    {
        "/internal/openapi.json",
        "/internal/docs",
        "/internal/docs/oauth2-redirect",
        "/internal/redoc",
    }
)


def _auth(token: str) -> dict[str, str]:
    return {"Access-Token": f"Bearer {token}"}


def _url(case: InternalRouteCase, world: InternalWorld) -> str:
    return case.path.format(**case.ids_for_world(world))


def _mounted_internal_routes() -> list[tuple[str, str]]:
    from app.main import app

    mounts = [
        route
        for route in app.routes
        if isinstance(route, Mount) and route.path == "/internal"
    ]
    assert len(mounts) == 1, "expected exactly one /internal mount"
    pairs: list[tuple[str, str]] = []
    for route in mounts[0].app.routes:
        path = getattr(route, "path", "")
        full_path = f"/internal{path}"
        if full_path in OPENAPI_INTERNAL_PATHS or full_path in EXCLUDED_INTERNAL_PATHS:
            continue
        for method in getattr(route, "methods", frozenset()):
            if method in ("HEAD", "OPTIONS"):
                continue
            pairs.append((method, full_path))
    return pairs


def test_internal_route_coverage_all_routes_registered() -> None:
    """Every mounted /internal route (except health/auth/logout) must be in INTERNAL_REGISTRY."""
    registered = {(case.method, case.path) for case in INTERNAL_REGISTRY}
    mounted = set(_mounted_internal_routes())
    missing = sorted(mounted - registered)
    extra = sorted(registered - mounted)
    assert not missing, f"Unregistered /internal routes: {missing}"
    assert not extra, f"Registry entries missing from /internal mount: {extra}"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case", INTERNAL_REGISTRY, ids=lambda case: f"{case.method} {case.path}"
)
async def test_internal_access_matrix(
    case: InternalRouteCase, async_client, session_factory
) -> None:
    """Every /internal route enforces: no token 401, customer token 401, non-staff 403, staff OK."""
    world = await build_internal_world(session_factory)
    url = _url(case, world)
    body = case.body_for_world(world)

    # 1. No token -> 401 credentials_required
    unauth = await async_client.request(case.method, url, json=body)
    assert unauth.status_code == 401, (case.method, url, unauth.text)
    assert unauth.json()["code"] == "credentials_required"

    # 2. Customer (/app audience) owner and admin tokens -> 401 invalid_token
    for cust_token in (world.customer_token, world.admin_customer_token):
        wrong_aud = await async_client.request(
            case.method, url, headers=_auth(cust_token), json=body
        )
        assert wrong_aud.status_code == 401, (case.method, url, wrong_aud.text)
        assert wrong_aud.json()["code"] == "invalid_token"

    # 3. Non-staff with internal-audience token (including org owner/admin) -> 403 staff_only
    for non_staff_internal in (
        world.non_staff_token,
        world.owner_internal_token,
        world.admin_internal_token,
    ):
        forbidden = await async_client.request(
            case.method, url, headers=_auth(non_staff_internal), json=body
        )
        assert forbidden.status_code == 403, (case.method, url, forbidden.text)
        assert forbidden.json()["code"] == "staff_only"

    # 4. Platform staff with internal-audience token -> 200/201/204
    ok = await async_client.request(
        case.method, url, headers=_auth(world.staff_token), json=body
    )
    assert ok.status_code in (200, 201, 204), (case.method, url, ok.text)


@pytest.mark.asyncio
async def test_staff_token_rejected_on_app_org_routes(
    async_client, session_factory
) -> None:
    """Staff internal token on /app/orgs/{id} -> 401; staff with app token -> 404 (not a member)."""
    world = await build_internal_world(session_factory)

    res_internal = await async_client.get(
        f"/app/orgs/{world.org_id}", headers=_auth(world.staff_token)
    )
    assert res_internal.status_code == 401
    assert res_internal.json()["code"] == "invalid_token"

    res_app = await async_client.get(
        f"/app/orgs/{world.org_id}", headers=_auth(world.staff_app_token)
    )
    assert res_app.status_code == 404
    assert res_app.json()["code"] == "not_found"


@pytest.mark.asyncio
async def test_internal_orgs_counts_search_pagination_and_detail(
    async_client, session_factory
) -> None:
    """Counts are accurate per org across multiple orgs; search, pagination and detail work."""
    suffix = uuid.uuid4().hex[:8]
    async with session_factory() as db:
        staff = User(
            first_name="Staff",
            last_name="Inspector",
            email=f"staff-{suffix}@example.com",
            password=hash_password("pass123456"),
            is_admin=True,
            is_active=True,
        )
        u1 = User(
            first_name="Ada",
            last_name="Lovelace",
            email=f"ada-{suffix}@example.com",
            password=hash_password("pass123456"),
            is_active=True,
        )
        u2 = User(
            first_name="Grace",
            last_name="Hopper",
            email=f"grace-{suffix}@example.com",
            password=hash_password("pass123456"),
            is_active=True,
        )
        u3 = User(
            first_name="Alan",
            last_name="Turing",
            email=f"alan-{suffix}@example.com",
            password=hash_password("pass123456"),
            is_active=True,
        )
        db.add_all([staff, u1, u2, u3])
        await db.flush()

        org_a = Organization(
            name=f"Alpha Orbit {suffix}",
            slug=f"alpha-orbit-{suffix}",
            last_active_at=datetime.now(UTC),
        )
        org_b = Organization(
            name=f"Beta Pulse {suffix}",
            slug=f"beta-pulse-{suffix}",
        )
        db.add_all([org_a, org_b])
        await db.flush()

        # Org A: 3 members, 2 teams, 2 plans
        m_a1 = Membership(org_id=org_a.id, user_id=u1.id, role="owner")
        m_a2 = Membership(org_id=org_a.id, user_id=u2.id, role="admin")
        m_a3 = Membership(org_id=org_a.id, user_id=u3.id, role="member")
        # Org B: 1 member, 1 team, 1 plan
        m_b1 = Membership(org_id=org_b.id, user_id=u1.id, role="owner")
        db.add_all([m_a1, m_a2, m_a3, m_b1])
        await db.flush()

        t_a1 = Team(org_id=org_a.id, name="Core", lead_membership_id=m_a1.id)
        t_a2 = Team(org_id=org_a.id, name="Infra", lead_membership_id=m_a2.id)
        t_b1 = Team(org_id=org_b.id, name="Growth", lead_membership_id=m_b1.id)
        db.add_all([t_a1, t_a2, t_b1])
        await db.flush()

        db.add_all(
            [
                TeamMember(org_id=org_a.id, team_id=t_a1.id, membership_id=m_a1.id),
                TeamMember(org_id=org_a.id, team_id=t_a2.id, membership_id=m_a2.id),
                TeamMember(org_id=org_b.id, team_id=t_b1.id, membership_id=m_b1.id),
            ]
        )
        await db.flush()

        today = datetime.now(UTC).date()
        monday = today - timedelta(days=today.weekday())
        p_a1 = Plan(
            org_id=org_a.id,
            membership_id=m_a1.id,
            team_id=t_a1.id,
            week_start=monday,
            status="draft",
        )
        p_a2 = Plan(
            org_id=org_a.id,
            membership_id=m_a2.id,
            team_id=t_a2.id,
            week_start=monday,
            status="submitted",
            submitted_at=datetime.now(UTC),
        )
        p_b1 = Plan(
            org_id=org_b.id,
            membership_id=m_b1.id,
            team_id=t_b1.id,
            week_start=monday,
            status="draft",
        )
        db.add_all([p_a1, p_a2, p_b1])
        await db.commit()
        staff_token = generate_jwt_token(
            {"sub": str(staff.id)}, audience=JWT_AUDIENCE_INTERNAL
        )
        org_a_id, org_b_id = org_a.id, org_b.id

    # Search by unique suffix returns both orgs with exact counts
    res = await async_client.get(
        f"/internal/orgs?q={suffix}", headers=_auth(staff_token)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 2
    by_id = {item["id"]: item for item in body["items"]}
    assert by_id[str(org_a_id)]["member_count"] == 3
    assert by_id[str(org_a_id)]["team_count"] == 2
    assert by_id[str(org_a_id)]["plan_count"] == 2
    assert by_id[str(org_a_id)]["is_suspended"] is False
    assert by_id[str(org_a_id)]["last_active_at"] is not None

    assert by_id[str(org_b_id)]["member_count"] == 1
    assert by_id[str(org_b_id)]["team_count"] == 1
    assert by_id[str(org_b_id)]["plan_count"] == 1

    # Search by slug substring
    slug_res = await async_client.get(
        f"/internal/orgs?q=alpha-orbit-{suffix}", headers=_auth(staff_token)
    )
    assert slug_res.status_code == 200
    assert slug_res.json()["total"] == 1
    assert slug_res.json()["items"][0]["id"] == str(org_a_id)

    # Pagination
    page1 = await async_client.get(
        f"/internal/orgs?q={suffix}&limit=1&offset=0", headers=_auth(staff_token)
    )
    page2 = await async_client.get(
        f"/internal/orgs?q={suffix}&limit=1&offset=1", headers=_auth(staff_token)
    )
    assert page1.json()["total"] == 2
    assert page2.json()["total"] == 2
    assert len(page1.json()["items"]) == 1
    assert len(page2.json()["items"]) == 1
    assert page1.json()["items"][0]["id"] != page2.json()["items"][0]["id"]

    # Detail endpoint includes member email, name, role
    detail = await async_client.get(
        f"/internal/orgs/{org_a_id}", headers=_auth(staff_token)
    )
    assert detail.status_code == 200
    detail_json = detail.json()
    assert detail_json["member_count"] == 3
    assert detail_json["team_count"] == 2
    assert detail_json["plan_count"] == 2
    assert len(detail_json["members"]) == 3
    roles_by_email = {
        m["email"]: (m["name"], m["role"]) for m in detail_json["members"]
    }
    assert roles_by_email[f"ada-{suffix}@example.com"] == ("Ada Lovelace", "owner")
    assert roles_by_email[f"grace-{suffix}@example.com"] == ("Grace Hopper", "admin")
    assert roles_by_email[f"alan-{suffix}@example.com"] == ("Alan Turing", "member")

    # Unknown org -> 404 not_found
    missing = await async_client.get(
        f"/internal/orgs/{uuid.uuid4()}", headers=_auth(staff_token)
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"


@pytest.mark.asyncio
async def test_suspend_and_reinstate_lifecycle_and_audit(
    async_client, session_factory
) -> None:
    """Suspend blocks org routes with 403 org_suspended, keeps login/me alive, writes 1 audit row, and reinstate restores."""
    suffix = uuid.uuid4().hex[:8]
    member_email = f"member-{suffix}@example.com"
    member_password = "memberpassword1"
    async with session_factory() as db:
        staff = User(
            first_name="Staff",
            last_name="Ops",
            email=f"staff-ops-{suffix}@example.com",
            password=hash_password("staffpassword1"),
            is_admin=True,
            is_active=True,
        )
        member = User(
            first_name="Member",
            last_name="One",
            email=member_email,
            password=hash_password(member_password),
            is_active=True,
        )
        org = Organization(name=f"Suspendable {suffix}", slug=f"susp-{suffix}")
        db.add_all([staff, member, org])
        await db.flush()
        db.add(Membership(org_id=org.id, user_id=member.id, role="owner"))
        await db.commit()
        staff_token = generate_jwt_token(
            {"sub": str(staff.id)}, audience=JWT_AUDIENCE_INTERNAL
        )
        member_token = generate_jwt_token({"sub": str(member.id)}, audience="app")
        org_id = org.id
        staff_id = staff.id

    # Before suspension: org access works
    pre = await async_client.get(f"/app/orgs/{org_id}", headers=_auth(member_token))
    assert pre.status_code == 200

    # Short reason -> 422 validation_error
    bad_reason = await async_client.post(
        f"/internal/orgs/{org_id}/suspend",
        headers=_auth(staff_token),
        json={"reason": "no"},
    )
    assert bad_reason.status_code == 422
    assert bad_reason.json()["code"] == "validation_error"

    # Suspend -> 200
    susp1 = await async_client.post(
        f"/internal/orgs/{org_id}/suspend",
        headers=_auth(staff_token),
        json={"reason": "Non-payment for 60 days"},
    )
    assert susp1.status_code == 200
    assert susp1.json()["is_suspended"] is True
    assert susp1.json()["suspended_at"] is not None
    assert susp1.json()["suspended_reason"] == "Non-payment for 60 days"

    # Repeat suspend is idempotent: 200, no extra staff_actions row
    susp2 = await async_client.post(
        f"/internal/orgs/{org_id}/suspend",
        headers=_auth(staff_token),
        json={"reason": "Duplicate click"},
    )
    assert susp2.status_code == 200
    async with session_factory() as db:
        count = await db.scalar(
            select(func.count(StaffAction.id)).where(
                StaffAction.target_id == org_id,
                StaffAction.action == "org_suspended",
            )
        )
        assert count == 1

    # Member immediately gets 403 org_suspended on org routes
    blocked = await async_client.get(f"/app/orgs/{org_id}", headers=_auth(member_token))
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "org_suspended"

    # Login and /app/me still work while org is suspended
    login_res = await async_client.post(
        "/app/auth/login",
        json={"email": member_email, "password": member_password},
    )
    assert login_res.status_code == 200
    me_res = await async_client.get("/app/me", headers=_auth(member_token))
    assert me_res.status_code == 200

    # Reinstate -> 200, clears fields, writes 1 org_reinstated row, idempotent on repeat
    rein1 = await async_client.post(
        f"/internal/orgs/{org_id}/reinstate", headers=_auth(staff_token)
    )
    assert rein1.status_code == 200
    assert rein1.json()["is_suspended"] is False
    assert rein1.json()["suspended_at"] is None
    assert rein1.json()["suspended_reason"] is None

    rein2 = await async_client.post(
        f"/internal/orgs/{org_id}/reinstate", headers=_auth(staff_token)
    )
    assert rein2.status_code == 200

    async with session_factory() as db:
        actions = (
            (
                await db.execute(
                    select(StaffAction)
                    .where(StaffAction.target_id == org_id)
                    .order_by(StaffAction.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
        assert [a.action for a in actions] == ["org_suspended", "org_reinstated"]
        assert actions[0].staff_user_id == staff_id
        assert actions[0].reason == "Non-payment for 60 days"

    # Member access is immediately restored without re-login
    restored = await async_client.get(
        f"/app/orgs/{org_id}", headers=_auth(member_token)
    )
    assert restored.status_code == 200


@pytest.mark.asyncio
async def test_concurrent_suspends_write_single_audit_row(
    async_client, session_factory
) -> None:
    """Two concurrent POST /internal/orgs/{id}/suspend calls serialize and write exactly one audit row."""
    world = await build_internal_world(session_factory)
    url = f"/internal/orgs/{world.org_id}/suspend"

    res1, res2 = await asyncio.gather(
        async_client.post(
            url,
            headers=_auth(world.staff_token),
            json={"reason": "Concurrent suspend A"},
        ),
        async_client.post(
            url,
            headers=_auth(world.second_staff_token),
            json={"reason": "Concurrent suspend B"},
        ),
    )
    assert res1.status_code == 200
    assert res2.status_code == 200

    async with session_factory() as db:
        rows = (
            (
                await db.execute(
                    select(StaffAction).where(
                        StaffAction.target_id == world.org_id,
                        StaffAction.action == "org_suspended",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_internal_users_search_pagination_detail_and_deactivation(
    async_client, session_factory
) -> None:
    """Users list/detail return org roles; deactivate kills live token and writes 1 audit row; self/staff deactivate -> 403."""
    suffix = uuid.uuid4().hex[:8]
    target_email = f"dijkstra-{suffix}@example.com"
    target_password = "dijkstrapass1"
    async with session_factory() as db:
        staff1 = User(
            first_name="Staff",
            last_name="Alpha",
            email=f"staff-a-{suffix}@example.com",
            password=hash_password("staffpass123"),
            is_admin=True,
            is_active=True,
        )
        staff2 = User(
            first_name="Staff",
            last_name="Beta",
            email=f"staff-b-{suffix}@example.com",
            password=hash_password("staffpass123"),
            is_admin=True,
            is_active=True,
        )
        target = User(
            first_name="Edsger",
            last_name="Dijkstra",
            email=target_email,
            password=hash_password(target_password),
            is_active=True,
        )
        org = Organization(name=f"Shortest Path {suffix}", slug=f"sp-{suffix}")
        db.add_all([staff1, staff2, target, org])
        await db.flush()
        db.add(Membership(org_id=org.id, user_id=target.id, role="admin"))
        await db.commit()
        staff_token = generate_jwt_token(
            {"sub": str(staff1.id)}, audience=JWT_AUDIENCE_INTERNAL
        )
        target_token = generate_jwt_token({"sub": str(target.id)}, audience="app")
        staff1_id, staff2_id, target_id, org_id = (
            staff1.id,
            staff2.id,
            target.id,
            org.id,
        )

    # Search by full name
    search_res = await async_client.get(
        "/internal/users?q=Edsger Dijkstra&limit=10&offset=0",
        headers=_auth(staff_token),
    )
    assert search_res.status_code == 200
    items = search_res.json()["items"]
    matched = [u for u in items if u["id"] == str(target_id)]
    assert len(matched) == 1
    assert matched[0]["name"] == "Edsger Dijkstra"
    assert matched[0]["email"] == target_email
    assert matched[0]["is_active"] is True
    assert matched[0]["orgs"] == [
        {"id": str(org_id), "name": f"Shortest Path {suffix}", "role": "admin"}
    ]

    # Detail
    detail_res = await async_client.get(
        f"/internal/users/{target_id}", headers=_auth(staff_token)
    )
    assert detail_res.status_code == 200
    assert detail_res.json()["orgs"] == [
        {"id": str(org_id), "name": f"Shortest Path {suffix}", "role": "admin"}
    ]

    # Self-deactivation -> 403 forbidden, no audit row
    self_deact = await async_client.post(
        f"/internal/users/{staff1_id}/deactivate",
        headers=_auth(staff_token),
        json={"reason": "Accidental self click"},
    )
    assert self_deact.status_code == 403
    assert self_deact.json()["code"] == "forbidden"

    # Other staff deactivation -> 403 forbidden, no audit row
    other_staff_deact = await async_client.post(
        f"/internal/users/{staff2_id}/deactivate",
        headers=_auth(staff_token),
        json={"reason": "Trying to deactivate peer staff"},
    )
    assert other_staff_deact.status_code == 403
    assert other_staff_deact.json()["code"] == "forbidden"

    async with session_factory() as db:
        staff_audit_count = await db.scalar(
            select(func.count(StaffAction.id)).where(
                StaffAction.target_id.in_([staff1_id, staff2_id])
            )
        )
        assert staff_audit_count == 0

    # Deactivate target user -> 200, kills live token immediately, idempotent on repeat
    assert (
        await async_client.get("/app/me", headers=_auth(target_token))
    ).status_code == 200

    deact1 = await async_client.post(
        f"/internal/users/{target_id}/deactivate",
        headers=_auth(staff_token),
        json={"reason": "Security rotation"},
    )
    assert deact1.status_code == 200
    assert deact1.json()["is_active"] is False

    deact2 = await async_client.post(
        f"/internal/users/{target_id}/deactivate",
        headers=_auth(staff_token),
        json={"reason": "Second click"},
    )
    assert deact2.status_code == 200

    # Existing /app token and login both fail immediately
    assert (
        await async_client.get("/app/me", headers=_auth(target_token))
    ).status_code == 401
    assert (
        await async_client.post(
            "/app/auth/login",
            json={"email": target_email, "password": target_password},
        )
    ).status_code == 401

    # Reactivate -> 200, restores token, idempotent on repeat
    react1 = await async_client.post(
        f"/internal/users/{target_id}/reactivate", headers=_auth(staff_token)
    )
    assert react1.status_code == 200
    assert react1.json()["is_active"] is True

    react2 = await async_client.post(
        f"/internal/users/{target_id}/reactivate", headers=_auth(staff_token)
    )
    assert react2.status_code == 200

    assert (
        await async_client.get("/app/me", headers=_auth(target_token))
    ).status_code == 200

    async with session_factory() as db:
        user_actions = (
            (
                await db.execute(
                    select(StaffAction)
                    .where(StaffAction.target_id == target_id)
                    .order_by(StaffAction.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
        assert [a.action for a in user_actions] == [
            "user_deactivated",
            "user_reactivated",
        ]


@pytest.mark.asyncio
async def test_internal_ai_usage_aggregates_daily_isolation_and_date_validation(
    async_client, session_factory
) -> None:
    """AI usage aggregates match hand-made rows, isolate orgs, zero-fill empty days, and validate dates."""
    suffix = uuid.uuid4().hex[:8]
    now = datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)
    day1 = (now - timedelta(days=2)).date()
    day2 = (now - timedelta(days=1)).date()
    day3 = now.date()

    async with session_factory() as db:
        staff = User(
            first_name="Staff",
            last_name="Metrics",
            email=f"staff-metrics-{suffix}@example.com",
            password=hash_password("staffpass123"),
            is_admin=True,
            is_active=True,
        )
        user_a = User(
            first_name="User",
            last_name="A",
            email=f"ua-{suffix}@example.com",
            password=hash_password("userpass123"),
            is_active=True,
        )
        user_b = User(
            first_name="User",
            last_name="B",
            email=f"ub-{suffix}@example.com",
            password=hash_password("userpass123"),
            is_active=True,
        )
        org_a = Organization(name=f"AI Org A {suffix}", slug=f"ai-a-{suffix}")
        org_b = Organization(name=f"AI Org B {suffix}", slug=f"ai-b-{suffix}")
        db.add_all([staff, user_a, user_b, org_a, org_b])
        await db.flush()

        m_a = Membership(org_id=org_a.id, user_id=user_a.id, role="owner")
        m_b = Membership(org_id=org_b.id, user_id=user_b.id, role="owner")
        db.add_all([m_a, m_b])
        await db.flush()

        # Org A calls:
        # day1: success (100ms, 50in, 20out), error (200ms, 30in, 0out), rate_limited (10ms, 0in, 0out)
        # day2: empty
        # day3: timeout (300ms, 40in, 0out), disabled (5ms, 0in, 0out)
        # out-of-window (40 days ago): success (999ms, 999in, 999out)
        db.add_all(
            [
                AiCall(
                    org_id=org_a.id,
                    membership_id=m_a.id,
                    feature="plan_review",
                    model="gemini-3.5-flash-lite",
                    status="success",
                    latency_ms=100,
                    input_tokens=50,
                    output_tokens=20,
                    created_at=now - timedelta(days=2),
                ),
                AiCall(
                    org_id=org_a.id,
                    membership_id=m_a.id,
                    feature="plan_review",
                    model="gemini-3.5-flash-lite",
                    status="error",
                    error_class="bad_output",
                    latency_ms=200,
                    input_tokens=30,
                    output_tokens=0,
                    created_at=now - timedelta(days=2),
                ),
                AiCall(
                    org_id=org_a.id,
                    membership_id=m_a.id,
                    feature="plan_draft",
                    model="gemini-3.5-flash-lite",
                    status="rate_limited",
                    error_class="local_limit",
                    latency_ms=10,
                    input_tokens=0,
                    output_tokens=0,
                    created_at=now - timedelta(days=2),
                ),
                AiCall(
                    org_id=org_a.id,
                    membership_id=m_a.id,
                    feature="plan_draft",
                    model="gemini-3.5-flash-lite",
                    status="timeout",
                    error_class=None,
                    latency_ms=300,
                    input_tokens=40,
                    output_tokens=0,
                    created_at=now,
                ),
                AiCall(
                    org_id=org_a.id,
                    membership_id=m_a.id,
                    feature="plan_review",
                    model="gemini-3.5-flash-lite",
                    status="disabled",
                    error_class=None,
                    latency_ms=5,
                    input_tokens=0,
                    output_tokens=0,
                    created_at=now,
                ),
                AiCall(
                    org_id=org_a.id,
                    membership_id=m_a.id,
                    feature="plan_review",
                    model="gemini-3.5-flash-lite",
                    status="success",
                    latency_ms=999,
                    input_tokens=999,
                    output_tokens=999,
                    created_at=now - timedelta(days=40),
                ),
                # Org B call on day3 (must never leak into Org A)
                AiCall(
                    org_id=org_b.id,
                    membership_id=m_b.id,
                    feature="plan_review",
                    model="gemini-3.5-flash-lite",
                    status="error",
                    error_class="bad_output",
                    latency_ms=500,
                    input_tokens=700,
                    output_tokens=300,
                    created_at=now,
                ),
            ]
        )
        await db.commit()
        staff_token = generate_jwt_token(
            {"sub": str(staff.id)}, audience=JWT_AUDIENCE_INTERNAL
        )
        org_a_id, org_b_id = org_a.id, org_b.id

    usage_res = await async_client.get(
        f"/internal/ai-usage?from={day1.isoformat()}&to={day3.isoformat()}&limit=100",
        headers=_auth(staff_token),
    )
    assert usage_res.status_code == 200
    rows_by_org = {row["org_id"]: row for row in usage_res.json()["items"]}

    row_a = rows_by_org[str(org_a_id)]
    assert row_a["org_name"] == f"AI Org A {suffix}"
    assert row_a["calls"] == 5
    assert row_a["failures"] == 2  # error + timeout only
    assert row_a["rate_limited"] == 1
    assert row_a["p50_latency_ms"] == 100.0  # median of [5, 10, 100, 200, 300]
    assert row_a["avg_latency_ms"] == 123.0  # (5+10+100+200+300)/5
    assert row_a["input_tokens"] == 120
    assert row_a["output_tokens"] == 20

    row_b = rows_by_org[str(org_b_id)]
    assert row_b["calls"] == 1
    assert row_b["failures"] == 1
    assert row_b["rate_limited"] == 0
    assert row_b["input_tokens"] == 700
    assert row_b["output_tokens"] == 300

    # Daily series for Org A: zero-fills day2 and excludes Org B
    daily_res = await async_client.get(
        f"/internal/ai-usage/{org_a_id}/daily?from={day1.isoformat()}&to={day3.isoformat()}",
        headers=_auth(staff_token),
    )
    assert daily_res.status_code == 200
    assert daily_res.json()["days"] == [
        {"date": day1.isoformat(), "calls": 3, "failures": 1, "rate_limited": 1},
        {"date": day2.isoformat(), "calls": 0, "failures": 0, "rate_limited": 0},
        {"date": day3.isoformat(), "calls": 2, "failures": 1, "rate_limited": 0},
    ]

    # Unknown org -> 404
    missing_daily = await async_client.get(
        f"/internal/ai-usage/{uuid.uuid4()}/daily?from={day1.isoformat()}&to={day3.isoformat()}",
        headers=_auth(staff_token),
    )
    assert missing_daily.status_code == 404
    assert missing_daily.json()["code"] == "not_found"

    # Bad dates: from > to -> 422, range > 90 days -> 422
    inverted = await async_client.get(
        f"/internal/ai-usage?from={day3.isoformat()}&to={day1.isoformat()}",
        headers=_auth(staff_token),
    )
    assert inverted.status_code == 422
    assert inverted.json()["code"] == "validation_error"

    too_wide_from = (day3 - timedelta(days=91)).isoformat()
    too_wide = await async_client.get(
        f"/internal/ai-usage?from={too_wide_from}&to={day3.isoformat()}",
        headers=_auth(staff_token),
    )
    assert too_wide.status_code == 422
    assert too_wide.json()["code"] == "validation_error"


@pytest.mark.asyncio
async def test_internal_audit_log_newest_first_with_names(
    async_client, session_factory
) -> None:
    """GET /internal/audit-log returns staff_actions newest first with staff_email and target_name."""
    world = await build_internal_world(session_factory)
    headers = _auth(world.staff_token)

    await async_client.post(
        f"/internal/orgs/{world.org_id}/suspend",
        headers=headers,
        json={"reason": "First audit entry"},
    )
    await async_client.post(
        f"/internal/users/{world.member_user_id}/deactivate",
        headers=headers,
        json={"reason": "Second audit entry"},
    )

    res = await async_client.get(
        "/internal/audit-log?limit=2&offset=0", headers=headers
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 2
    assert items[0]["action"] == "user_deactivated"
    assert items[0]["staff_email"] == world.staff_email
    assert items[0]["target_name"] == world.member_email
    assert items[0]["reason"] == "Second audit entry"

    assert items[1]["action"] == "org_suspended"
    assert items[1]["staff_email"] == world.staff_email
    assert items[1]["target_name"] == "Northstar Engineering"
    assert items[1]["reason"] == "First audit entry"

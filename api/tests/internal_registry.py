"""Internal-surface access registry (docs/API.md §"/internal").

Every ``/internal`` route MUST appear here so three things stay in lockstep:

- the route-coverage test, which fails when a new ``/internal`` route ships
  untested (mirrors the customer tenancy registry);
- the access matrix, which calls every route with no token, a customer
  (``/app``-audience) token, a non-staff internal token and a staff token; and
- the privacy test, which calls every route and asserts no plan/task/AI text —
  or a ``title``/``why``/``notes``/``prompt``/``text`` key — appears in the
  serialized JSON.

Retained template routes (``GET /health``, ``POST /auth``, ``POST /logout``)
are excluded: they are deliberately public (health) or the login surface
itself, and covered by their own tests.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from faker import Faker

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
from app.security import JWT_AUDIENCE_INTERNAL, generate_jwt_token, hash_password

fake = Faker()

EXCLUDED_INTERNAL_PATHS: frozenset[str] = frozenset(
    {
        "/internal/health",
        "/internal/auth",
        "/internal/logout",
    }
)


@dataclass
class InternalWorld:
    """Tokens and resource ids for one internal-matrix iteration."""

    staff_token: str
    staff_app_token: str
    second_staff_token: str
    non_staff_token: str
    customer_token: str
    admin_customer_token: str
    owner_internal_token: str
    admin_internal_token: str
    member_token: str
    staff_user_id: UUID
    second_staff_user_id: UUID
    non_staff_user_id: UUID
    owner_user_id: UUID
    admin_user_id: UUID
    member_user_id: UUID
    org_id: UUID
    user_id: UUID
    user_email: str
    member_email: str
    staff_email: str
    new_user_email: str
    marker: str


@dataclass(frozen=True)
class InternalRouteCase:
    """One ``/internal`` route and how to build a valid call against the world."""

    method: str
    path: str  # full path including the /internal mount
    ids_for_world: Callable[[InternalWorld], dict[str, str]] = lambda world: {}
    body_for_world: Callable[[InternalWorld], dict | None] = lambda world: None


def _org_ids(world: InternalWorld) -> dict[str, str]:
    return {"org_id": str(world.org_id)}


def _member_user_ids(world: InternalWorld) -> dict[str, str]:
    return {"user_id": str(world.member_user_id)}


def _deletable_user_ids(world: InternalWorld) -> dict[str, str]:
    return {"user_id": str(world.user_id)}


def _new_user_body(world: InternalWorld) -> dict:
    return {
        "first_name": "New",
        "last_name": "Person",
        "email": world.new_user_email,
        "password": "secret12345",
        "is_admin": False,
        "is_active": True,
    }


INTERNAL_REGISTRY: list[InternalRouteCase] = [
    InternalRouteCase("GET", "/internal/orgs"),
    InternalRouteCase("GET", "/internal/orgs/{org_id}", _org_ids),
    InternalRouteCase(
        "POST",
        "/internal/orgs/{org_id}/suspend",
        _org_ids,
        lambda world: {"reason": "Abuse report from support"},
    ),
    InternalRouteCase("POST", "/internal/orgs/{org_id}/reinstate", _org_ids),
    InternalRouteCase("GET", "/internal/users"),
    InternalRouteCase("GET", "/internal/users/self"),
    InternalRouteCase("GET", "/internal/users/{user_id}", _member_user_ids),
    InternalRouteCase(
        "POST",
        "/internal/users/{user_id}/deactivate",
        _member_user_ids,
        lambda world: {"reason": "Left the company"},
    ),
    InternalRouteCase("POST", "/internal/users/{user_id}/reactivate", _member_user_ids),
    InternalRouteCase("POST", "/internal/users", body_for_world=_new_user_body),
    InternalRouteCase(
        "PATCH",
        "/internal/users/{user_id}",
        _member_user_ids,
        lambda world: {"last_name": "Renamed"},
    ),
    InternalRouteCase(
        "POST",
        "/internal/users/{user_id}/change-password",
        _member_user_ids,
        lambda world: {"password": "newsecret12"},
    ),
    InternalRouteCase("DELETE", "/internal/users/{user_id}", _deletable_user_ids),
    InternalRouteCase("GET", "/internal/ai-usage"),
    InternalRouteCase("GET", "/internal/ai-usage/{org_id}/daily", _org_ids),
    InternalRouteCase("GET", "/internal/audit-log"),
]


async def _create_user(
    db,
    *,
    first_name: str,
    last_name: str,
    is_admin: bool = False,
    password: str = "validpass123",
) -> User:
    user = User(
        first_name=first_name,
        last_name=last_name,
        email=f"{uuid.uuid4().hex[:10]}@example.com",
        password=hash_password(password),
        is_admin=is_admin,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def build_internal_world(
    session_factory, *, marker: str = "CONFIDENTIAL_PLAN_MARKER_8a7b6c"
) -> InternalWorld:
    """Seed a full world for internal access-matrix and privacy tests."""
    async with session_factory() as db:
        staff = await _create_user(
            db, first_name="Staff", last_name="One", is_admin=True
        )
        second_staff = await _create_user(
            db, first_name="Staff", last_name="Two", is_admin=True
        )
        non_staff = await _create_user(
            db, first_name="Plain", last_name="Caller", is_admin=False
        )
        owner = await _create_user(
            db, first_name="Org", last_name="Owner", is_admin=False
        )
        admin = await _create_user(
            db, first_name="Org", last_name="Admin", is_admin=False
        )
        member = await _create_user(
            db, first_name="Org", last_name="Member", is_admin=False
        )
        deletable = await _create_user(
            db, first_name="Temp", last_name="User", is_admin=False
        )

        org = Organization(
            name="Northstar Engineering",
            slug=f"northstar-{uuid.uuid4().hex[:10]}",
        )
        db.add(org)
        await db.flush()

        owner_m = Membership(org_id=org.id, user_id=owner.id, role="owner")
        admin_m = Membership(org_id=org.id, user_id=admin.id, role="admin")
        member_m = Membership(org_id=org.id, user_id=member.id, role="member")
        db.add_all([owner_m, admin_m, member_m])
        await db.flush()

        team = Team(
            org_id=org.id,
            name="Core Platform",
            lead_membership_id=owner_m.id,
        )
        db.add(team)
        await db.flush()
        db.add_all(
            [
                TeamMember(org_id=org.id, team_id=team.id, membership_id=owner_m.id),
                TeamMember(org_id=org.id, team_id=team.id, membership_id=member_m.id),
            ]
        )
        await db.flush()

        today = datetime.now(UTC).date()
        monday = today - timedelta(days=today.weekday())
        plan = Plan(
            org_id=org.id,
            membership_id=member_m.id,
            team_id=team.id,
            week_start=monday,
            status="submitted",
            submitted_at=datetime.now(UTC),
            decision_comment=f"Lead comment carrying {marker}",
        )
        db.add(plan)
        await db.flush()

        db.add_all(
            [
                Task(
                    org_id=org.id,
                    plan_id=plan.id,
                    kind="main",
                    title=f"Main task {marker}",
                    why=f"Main why {marker}",
                    position=0,
                ),
                Task(
                    org_id=org.id,
                    plan_id=plan.id,
                    kind="sub_goal",
                    title=f"Sub goal {marker}",
                    position=0,
                ),
                Task(
                    org_id=org.id,
                    plan_id=plan.id,
                    kind="gtm",
                    title=f"GTM goal {marker}",
                    position=0,
                ),
                PlanEvent(
                    org_id=org.id,
                    plan_id=plan.id,
                    actor_membership_id=member_m.id,
                    action="submitted",
                    comment=f"Event comment {marker}",
                ),
                AiCall(
                    org_id=org.id,
                    membership_id=member_m.id,
                    feature="plan_review",
                    model="gemini-3.5-flash-lite",
                    status="success",
                    latency_ms=140,
                    input_tokens=210,
                    output_tokens=95,
                ),
            ]
        )
        await db.commit()

        return InternalWorld(
            staff_token=generate_jwt_token(
                {"sub": str(staff.id)}, audience=JWT_AUDIENCE_INTERNAL
            ),
            staff_app_token=generate_jwt_token({"sub": str(staff.id)}, audience="app"),
            second_staff_token=generate_jwt_token(
                {"sub": str(second_staff.id)}, audience=JWT_AUDIENCE_INTERNAL
            ),
            non_staff_token=generate_jwt_token(
                {"sub": str(non_staff.id)}, audience=JWT_AUDIENCE_INTERNAL
            ),
            customer_token=generate_jwt_token({"sub": str(owner.id)}, audience="app"),
            admin_customer_token=generate_jwt_token(
                {"sub": str(admin.id)}, audience="app"
            ),
            owner_internal_token=generate_jwt_token(
                {"sub": str(owner.id)}, audience=JWT_AUDIENCE_INTERNAL
            ),
            admin_internal_token=generate_jwt_token(
                {"sub": str(admin.id)}, audience=JWT_AUDIENCE_INTERNAL
            ),
            member_token=generate_jwt_token({"sub": str(member.id)}, audience="app"),
            staff_user_id=staff.id,
            second_staff_user_id=second_staff.id,
            non_staff_user_id=non_staff.id,
            owner_user_id=owner.id,
            admin_user_id=admin.id,
            member_user_id=member.id,
            org_id=org.id,
            user_id=deletable.id,
            user_email=deletable.email,
            member_email=member.email,
            staff_email=staff.email,
            new_user_email=f"created-{uuid.uuid4().hex[:10]}@example.com",
            marker=marker,
        )

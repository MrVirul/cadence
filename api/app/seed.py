"""Deterministic demo seed (root ``AGENTS.md`` §10).

``uv run manage.py seed-demo [--reset]`` builds three organizations, their
people, teams and six past weeks of plans so every screen in the product has
something honest to show.

Design rules:

- **Deterministic.** Dates are relative to the current UTC Monday and all
  random choices come from one seeded ``random.Random``.
- **Services first.** Users, orgs, teams the plan state machine run through the
  real service functions, so the demo data obeys every rule the API enforces.
  Direct inserts are used only where the API refuses to help: past weeks (the
  API rejects past ``week_start``) and AI telemetry (``ai_calls``).
- **Never touches non-demo data.** --reset deletes only orgs with the demo
  slugs and users with the demo emails; everything else is left alone.
- **No secrets in ``ai_calls``.** Only metadata (model, status, latency, tokens)
  is written — never prompt or plan text.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.app.org_access import OrgContext
from app.api.app.schemas import TaskInput
from app.clock import current_week_start, today_utc
from app.models import (
    AiCall,
    Membership,
    Organization,
    Plan,
    PlanEvent,
    Task,
    Team,
    User,
)
from app.services.organizations import OrganizationService
from app.services.plans import PlanService
from app.services.teams import TeamService
from app.services.users import UserService

DEMO_PASSWORD = "cadence-demo-1"
DEMO_SLUGS = ("northwind", "bluebird", "dormant")
DEMO_AI_MODEL = "gemini-3.5-flash-lite"
_PAST_WEEKS = 6

# Deterministic content. One seed drives every random choice below.
_RNG_SEED = 20261012

_DOCS_PATH = Path(__file__).resolve().parents[2] / "docs" / "DEMO_LOGINS.md"


@dataclass(frozen=True)
class MemberSpec:
    email: str
    first_name: str
    last_name: str
    role: str  # owner | admin | member
    teams: tuple[str, ...] = ()
    # Current-week plan state for this member: None, "draft", "submitted",
    # "approved" or "sent_back".
    current: str | None = None


@dataclass(frozen=True)
class TeamSpec:
    name: str
    lead_email: str | None = None


@dataclass(frozen=True)
class OrgSpec:
    name: str
    slug: str
    members: tuple[MemberSpec, ...]
    teams: tuple[TeamSpec, ...] = ()
    suspended: bool = False
    suspended_reason: str | None = None


DEMO_ORGS: tuple[OrgSpec, ...] = (
    OrgSpec(
        name="Northwind Labs",
        slug="northwind",
        members=(
            MemberSpec(
                "owner@northwind.test", "Amara", "Osei", "owner", teams=("Product",)
            ),
            MemberSpec(
                "admin@northwind.test", "Ben", "Carter", "admin", teams=("Platform",)
            ),
            MemberSpec(
                "lead@northwind.test",
                "Priya",
                "Nair",
                "member",
                teams=("Platform",),
                current="sent_back",
            ),
            MemberSpec(
                "lead2@northwind.test",
                "Diego",
                "Alvarez",
                "member",
                teams=("Product",),
            ),
            MemberSpec(
                "member@northwind.test",
                "Sam",
                "Whitfield",
                "member",
                teams=("Platform", "Product"),
                current="draft",
            ),
            MemberSpec(
                "member2@northwind.test",
                "Lena",
                "Hoffman",
                "member",
                teams=("Platform",),
                current="submitted",
            ),
            MemberSpec(
                "member3@northwind.test",
                "Tariq",
                "Rahman",
                "member",
                teams=("Product",),
                current="approved",
            ),
        ),
        teams=(
            TeamSpec("Platform", lead_email="lead@northwind.test"),
            TeamSpec("Product", lead_email="lead2@northwind.test"),
        ),
    ),
    OrgSpec(
        name="Bluebird Studio",
        slug="bluebird",
        members=(
            MemberSpec("owner@bluebird.test", "Grace", "Lin", "owner", teams=("Core",)),
            MemberSpec(
                "admin@bluebird.test",
                "Omar",
                "Haddad",
                "admin",
                teams=("Growth",),
                current="draft",
            ),
            MemberSpec(
                "lead@bluebird.test",
                "Nina",
                "Kowalski",
                "member",
                teams=("Growth",),
                current="submitted",
            ),
            MemberSpec(
                "member@bluebird.test",
                "Ravi",
                "Patel",
                "member",
                teams=("Growth",),
            ),
            MemberSpec(
                "member2@bluebird.test",
                "Sofia",
                "Rossi",
                "member",
                teams=("Core",),
            ),
        ),
        teams=(
            TeamSpec("Growth", lead_email="lead@bluebird.test"),
            TeamSpec("Core", lead_email=None),
        ),
    ),
    OrgSpec(
        name="Dormant Co",
        slug="dormant",
        members=(
            MemberSpec("owner@dormant.test", "Pat", "Mbeki", "owner"),
            MemberSpec("member@dormant.test", "Zoe", "Adams", "member"),
        ),
        suspended=True,
        suspended_reason="Trial ended without upgrading — kept suspended for the demo.",
    ),
)

STAFF_EMAIL = "staff@cadence.test"
STAFF_NAME = ("Casey", "Morgan")

DEMO_EMAILS: tuple[str, ...] = tuple(
    member.email for org in DEMO_ORGS for member in org.members
) + (STAFF_EMAIL,)


@dataclass(frozen=True)
class DemoLogin:
    role: str
    email: str
    org: str


@dataclass
class SeedResult:
    """What ``seed_demo`` produced (or found)."""

    created: bool
    logins: list[DemoLogin]
    orgs: int = 0
    users: int = 0
    teams: int = 0
    plans: int = 0
    ai_calls: int = 0


# --- realistic plan wording ------------------------------------------------

_MAIN_TASKS: tuple[tuple[str, str], ...] = (
    (
        "Checkout handles expired cards, confirmed on staging",
        "Failed renewals are the top support ticket this month",
    ),
    (
        "Workspace invites send a valid, single-use link",
        "New teams can onboard without support doing it by hand",
    ),
    (
        "Export streams 100k rows without timing out",
        "The enterprise pilot is blocked on reliable exports",
    ),
    (
        "Password reset works end to end on mobile",
        "Mobile users are locked out of the beta otherwise",
    ),
    (
        "Webhook retries are idempotent; replays no longer duplicate invoices",
        "Duplicate invoices broke trust with two early customers",
    ),
    (
        "Search returns results in under 300ms on the demo dataset",
        "Slow search is the first thing prospects notice in demos",
    ),
)

# Deliberately vague, so the AI review has something to catch (brief §10).
_VAGUE_MAIN_TASKS: tuple[tuple[str, str], ...] = (
    ("Implement checkout", "Checkout is the blocker for the pricing change"),
    ("Work on API", "The API needs work for the integration"),
    ("Improve onboarding", "Onboarding is important for activation"),
)

_SUB_GOALS: tuple[tuple[str, str | None], ...] = (
    ("Unit tests cover the retry path", "Retries are where the last bug hid"),
    ("Staging config points at the sandbox gateway", None),
    ("Error states use the shared empty-state component", None),
    ("Migration is reversible and reviewed", "A bad migration is hard to undo"),
    ("Metrics for the new flow land in the dashboard", None),
    ("Docs page updated with the new steps", None),
    ("Load test runs in CI on every push", "Regressions should fail the build"),
)

_GTM_GOALS: tuple[tuple[str, str], ...] = (
    (
        "Analytics event fires when a plan is approved",
        "We need to know whether teams actually use approvals",
    ),
    (
        "Changelog entry published for the new export",
        "Customers adopt what they hear about",
    ),
    (
        "Onboarding step explains the Monday ritual",
        "New admins do not know where to start",
    ),
    ("Feature flag gates the new billing page", "Lets us roll back without a deploy"),
    ("Landing page shows the new pricing", "Prospects keep asking what it costs"),
)


def _dt(day: date, hour: int = 9) -> datetime:
    return datetime.combine(day, time(hour, 0), tzinfo=UTC)


def _task_blueprint(
    rng: random.Random, *, vague: bool, shipped: bool
) -> list[dict[str, object]]:
    """Main + 2-4 sub-goals + 1-3 GTM goals as a small dict list.

    A shipped week finishes its tasks; a week that did not ship leaves the main
    task (or its sub-goals) partly or wholly open.
    """
    main = rng.choice(_VAGUE_MAIN_TASKS if vague else _MAIN_TASKS)
    subs = rng.sample(_SUB_GOALS, k=rng.randint(2, 4))
    gtms = rng.sample(_GTM_GOALS, k=rng.randint(1, 3))

    def status() -> str:
        if shipped:
            return "done"
        return rng.choice(("todo", "todo", "done"))

    tasks: list[dict[str, object]] = [
        {"kind": "main", "title": main[0], "why": main[1], "status": status()}
    ]
    for title, why in subs:
        tasks.append(
            {"kind": "sub_goal", "title": title, "why": why, "status": status()}
        )
    for title, why in gtms:
        tasks.append({"kind": "gtm", "title": title, "why": why, "status": status()})
    return tasks


# --- reset / existence ------------------------------------------------------


async def demo_exists(session: AsyncSession) -> bool:
    """True when any demo organization is already present."""
    found = await session.scalar(
        select(Organization.id).where(Organization.slug.in_(DEMO_SLUGS)).limit(1)
    )
    return found is not None


async def reset_demo(session: AsyncSession) -> None:
    """Delete only the demo orgs (cascade) and demo users. Flushes, no commit.

    The caller commits. Non-demo rows are never selected, so they are never
    touched.
    """
    demo_org_ids = select(Organization.id).where(Organization.slug.in_(DEMO_SLUGS))
    await session.execute(delete(Organization).where(Organization.id.in_(demo_org_ids)))
    await session.execute(delete(User).where(User.email.in_(DEMO_EMAILS)))
    await session.flush()


# --- seed -------------------------------------------------------------------


async def seed_demo(
    session: AsyncSession,
    *,
    reset: bool = False,
    today: date | None = None,
) -> SeedResult:
    """Create the demo dataset. Idempotent unless ``reset`` is set."""
    if reset:
        await reset_demo(session)
    elif await demo_exists(session):
        return SeedResult(created=False, logins=await _existing_logins(session))

    today = today or today_utc()
    monday = current_week_start(today)
    rng = random.Random(_RNG_SEED)

    users = UserService(session)
    orgs_service = OrganizationService(session)
    teams_service = TeamService(session)
    plans_service = PlanService(session)

    # Staff user goes through the same path as `create-user --admin`.
    await users.create_user(
        first_name=STAFF_NAME[0],
        last_name=STAFF_NAME[1],
        email=STAFF_EMAIL,
        password=DEMO_PASSWORD,
        is_admin=True,
        is_active=True,
    )

    logins: list[DemoLogin] = [
        DemoLogin(role="staff", email=STAFF_EMAIL, org="Cadence staff")
    ]
    plan_count = 0
    team_count = 0

    for spec in DEMO_ORGS:
        org, memberships, contexts, teams = await _seed_org(
            session, spec, users, orgs_service, teams_service
        )
        team_count += len(teams)
        plan_count += await _seed_past_plans(
            session, spec, org, memberships, teams, monday, rng
        )

        current_count = await _seed_current_week(
            session, spec, org, memberships, contexts, teams, plans_service, monday
        )
        plan_count += current_count

        if spec.suspended:
            org.is_suspended = True
            org.suspended_at = _dt(monday - timedelta(days=10), 11)
            org.suspended_reason = spec.suspended_reason

        for member in spec.members:
            logins.append(DemoLogin(role=member.role, email=member.email, org=org.name))

    ai_count = await _seed_ai_calls(session, rng)

    await session.commit()
    return SeedResult(
        created=True,
        logins=logins,
        orgs=len(DEMO_ORGS),
        users=len(DEMO_EMAILS),
        teams=team_count,
        plans=plan_count,
        ai_calls=ai_count,
    )


async def _seed_org(
    session: AsyncSession,
    spec: OrgSpec,
    users: UserService,
    orgs_service: OrganizationService,
    teams_service: TeamService,
) -> tuple[Organization, dict[str, Membership], dict[str, OrgContext], dict[str, Team]]:
    """Create one org's users, memberships and teams. Returns lookup maps."""
    owner_spec = next(m for m in spec.members if m.role == "owner")
    owner = await users.create_user(
        first_name=owner_spec.first_name,
        last_name=owner_spec.last_name,
        email=owner_spec.email,
        password=DEMO_PASSWORD,
        is_active=True,
    )
    org, owner_membership = await orgs_service.create_with_owner(
        name=spec.name, user=owner
    )
    # `create_with_owner` slugifies the name ("Northwind Labs" →
    # "northwind-labs"); the brief fixes the demo slugs, and reset/idempotency
    # key off them, so pin the slug here.
    org.slug = spec.slug
    await session.flush()

    memberships: dict[str, Membership] = {owner_spec.email: owner_membership}
    user_by_email = {owner_spec.email: owner}

    for member in spec.members:
        if member.email == owner_spec.email:
            continue
        user = await users.create_user(
            first_name=member.first_name,
            last_name=member.last_name,
            email=member.email,
            password=DEMO_PASSWORD,
            is_active=True,
        )
        user_by_email[member.email] = user
        membership = Membership(org_id=org.id, user_id=user.id, role=member.role)
        session.add(membership)
        await session.flush()
        memberships[member.email] = membership

    # The owner's context drives the admin-only team writes.
    owner_ctx = OrgContext(org=org, membership=owner_membership, role="owner")
    contexts: dict[str, OrgContext] = {}
    for member in spec.members:
        contexts[member.email] = OrgContext(
            org=org,
            membership=memberships[member.email],
            role=member.role,  # type: ignore[arg-type]
        )

    teams: dict[str, Team] = {}
    for team_spec in spec.teams:
        lead_id = (
            memberships[team_spec.lead_email].id
            if team_spec.lead_email is not None
            else None
        )
        team = await teams_service.create(
            ctx=owner_ctx, name=team_spec.name, lead_membership_id=lead_id
        )
        member_ids = [
            memberships[m.email].id for m in spec.members if team_spec.name in m.teams
        ]
        if (
            team_spec.lead_email is not None
            and memberships[team_spec.lead_email].id not in member_ids
        ):
            member_ids.append(memberships[team_spec.lead_email].id)
        await teams_service.replace_members(
            ctx=owner_ctx, team_id=team.id, membership_ids=member_ids
        )
        teams[team_spec.name] = team

    return org, memberships, contexts, teams


async def _seed_past_plans(
    session: AsyncSession,
    spec: OrgSpec,
    org: Organization,
    memberships: dict[str, Membership],
    teams: dict[str, Team],
    monday: date,
    rng: random.Random,
) -> int:
    """Six past weeks per member, inserted directly (the API rejects past weeks)."""
    count = 0
    open_approved = {
        (spec.slug, "member@northwind.test", 3),
        (spec.slug, "member2@bluebird.test", 4),
    }
    for member in spec.members:
        primary_team = teams.get(member.teams[0]) if member.teams else None
        if primary_team is None:
            continue
        membership = memberships[member.email]
        for offset in range(1, _PAST_WEEKS + 1):
            week_start = monday - timedelta(weeks=offset)
            approved_only = (spec.slug, member.email, offset) in open_approved
            shipped = rng.random() < 0.6
            vague = offset in (2, 5)
            await _insert_past_plan(
                session,
                org=org,
                membership=membership,
                team=primary_team,
                week_start=week_start,
                shipped=shipped,
                approved_only=approved_only,
                vague=vague,
                rng=rng,
            )
            count += 1
    return count


async def _insert_past_plan(
    session: AsyncSession,
    *,
    org: Organization,
    membership: Membership,
    team: Team,
    week_start: date,
    shipped: bool,
    approved_only: bool,
    vague: bool,
    rng: random.Random,
) -> Plan:
    """One completed (or approved-still-open) past plan with tasks and events."""
    status = "approved" if approved_only else "done"
    # The approving team's lead decides; a leadless team falls back to the
    # author (the documented self-approval case).
    decider = team.lead_membership_id or membership.id
    plan = Plan(
        org_id=org.id,
        membership_id=membership.id,
        team_id=team.id,
        week_start=week_start,
        status=status,
        created_at=_dt(week_start - timedelta(days=4), 15),
        submitted_at=_dt(week_start, 9),
        decided_at=_dt(week_start + timedelta(days=1), 10),
        decided_by_membership_id=decider,
        shipped=None if approved_only else shipped,
        closed_at=None if approved_only else _dt(week_start + timedelta(days=4), 16),
    )
    session.add(plan)
    await session.flush()

    blueprint = _task_blueprint(rng, vague=vague, shipped=shipped)
    positions: dict[str, int] = {}
    for item in blueprint:
        kind = str(item["kind"])
        position = positions.get(kind, 0)
        positions[kind] = position + 1
        task_status = str(item["status"])
        session.add(
            Task(
                org_id=org.id,
                plan_id=plan.id,
                kind=kind,
                title=str(item["title"]),
                why=item["why"] if item["why"] is None else str(item["why"]),
                status=task_status,
                position=position,
                done_at=_dt(week_start + timedelta(days=3), 14)
                if task_status == "done"
                else None,
            )
        )

    # Submitted → approved, then closed unless left open on purpose.
    session.add(
        PlanEvent(
            org_id=org.id,
            plan_id=plan.id,
            actor_membership_id=membership.id,
            action="submitted",
            created_at=_dt(week_start, 9),
        )
    )
    session.add(
        PlanEvent(
            org_id=org.id,
            plan_id=plan.id,
            actor_membership_id=decider,
            action="approved",
            self_approved=decider == membership.id,
            created_at=_dt(week_start + timedelta(days=1), 10),
        )
    )
    if not approved_only:
        session.add(
            PlanEvent(
                org_id=org.id,
                plan_id=plan.id,
                actor_membership_id=membership.id,
                action="closed",
                created_at=_dt(week_start + timedelta(days=4), 16),
            )
        )
    await session.flush()
    return plan


async def _seed_current_week(
    session: AsyncSession,
    spec: OrgSpec,
    org: Organization,
    memberships: dict[str, Membership],
    contexts: dict[str, OrgContext],
    teams: dict[str, Team],
    plans_service: PlanService,
    monday: date,
) -> int:
    """Current-week plans in the states the brief asks to demo.

    Drafts are created and then moved through the real state machine, so the
    plans, tasks and ``plan_events`` match every rule the API enforces.
    """
    approver_email = next(
        (m.email for m in spec.members if m.role in ("admin", "owner")), None
    )
    count = 0
    for member in spec.members:
        if member.current is None or not member.teams:
            continue
        ctx = contexts[member.email]
        team = teams[member.teams[0]]
        blueprint = _task_blueprint(
            random.Random(f"{spec.slug}-{member.email}"), vague=False, shipped=False
        )
        tasks_in = [
            TaskInput(
                kind=item["kind"],  # type: ignore[arg-type]
                title=str(item["title"]),
                why=item["why"] if item["why"] is None else str(item["why"]),
            )
            for item in blueprint
        ]
        plan = await plans_service.create(
            ctx=ctx, today=monday, week_start=monday, team_id=team.id, tasks_in=tasks_in
        )
        count += 1

        if member.current in ("submitted", "approved", "sent_back"):
            await plans_service.submit(ctx=ctx, plan_id=plan.id, today=monday)
        if member.current in ("approved", "sent_back") and approver_email is not None:
            approver = contexts[approver_email]
            if member.current == "approved":
                await plans_service.approve(ctx=approver, plan_id=plan.id)
            else:
                await plans_service.send_back(
                    ctx=approver,
                    plan_id=plan.id,
                    comment=(
                        "'Work on API' does not say what ships by Friday. Make it "
                        "a checkable result and add the analytics event."
                    ),
                )
    return count


async def _seed_ai_calls(session: AsyncSession, rng: random.Random) -> int:
    """Metadata-only AI telemetry over the last 14 days for the active orgs.

    Mostly successes, but each active org knowingly gets an error, a timeout and
    a rate-limited row so the admin usage view has every state to show. The rare
    states are guaranteed rather than left to chance.
    """
    member_rows = (
        await session.execute(
            select(Membership.org_id, Membership.id)
            .join(Organization, Organization.id == Membership.org_id)
            .where(Organization.slug.in_(("northwind", "bluebird")))
            .order_by(Membership.org_id, Membership.id)
        )
    ).all()
    if not member_rows:
        return 0

    by_org: dict[object, list[object]] = {}
    for org_id, membership_id in member_rows:
        by_org.setdefault(org_id, []).append(membership_id)

    now = datetime.now(UTC)
    day0 = now.date() - timedelta(days=13)
    count = 0
    for org_index, (org_id, membership_ids) in enumerate(by_org.items()):
        for member_index, membership_id in enumerate(membership_ids[:3]):
            statuses = ["success"] * 4 + ["error", "timeout", "rate_limited"]
            rng.shuffle(statuses)
            for status_index, status in enumerate(statuses):
                day = day0 + timedelta(
                    days=(org_index + member_index + status_index) % 14
                )
                error_class = None
                latency_ms = None
                input_tokens = None
                output_tokens = None
                model: str | None = DEMO_AI_MODEL
                if status == "success":
                    latency_ms = rng.randint(700, 4200)
                    input_tokens = rng.randint(300, 1400)
                    output_tokens = rng.randint(120, 700)
                elif status == "timeout":
                    latency_ms = 20000
                elif status == "rate_limited":
                    error_class = rng.choice(("upstream_429", "local_limit"))
                    latency_ms = rng.randint(120, 900)
                else:  # error
                    error_class = "bad_output"
                    latency_ms = rng.randint(400, 2500)
                    model = None
                session.add(
                    AiCall(
                        org_id=org_id,
                        membership_id=membership_id,
                        feature=rng.choice(("plan_review", "plan_draft")),
                        model=model,
                        status=status,
                        error_class=error_class,
                        latency_ms=latency_ms,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        created_at=_dt(day, rng.randint(8, 18)),
                    )
                )
                count += 1
    await session.flush()
    return count


async def _existing_logins(session: AsyncSession) -> list[DemoLogin]:
    """Rebuild the login table from existing demo data (idempotent branch)."""
    rows = (
        await session.execute(
            select(Organization.name, Membership.role, User.email)
            .join(Membership, Membership.org_id == Organization.id)
            .join(User, User.id == Membership.user_id)
            .where(Organization.slug.in_(DEMO_SLUGS))
        )
    ).all()
    logins = [DemoLogin(role=role, email=email, org=name) for name, role, email in rows]
    logins.sort(key=lambda login: (login.org, login.role, login.email))
    logins.append(DemoLogin(role="staff", email=STAFF_EMAIL, org="Cadence staff"))
    return logins


def render_logins_table(logins: list[DemoLogin]) -> str:
    """A plain markdown table of demo logins, shared by the CLI and docs."""
    lines = [
        "| Role | Email | Password | Org |",
        "|---|---|---|---|",
    ]
    for login in logins:
        lines.append(
            f"| {login.role} | {login.email} | {DEMO_PASSWORD} | {login.org} |"
        )
    return "\n".join(lines)


def write_demo_logins(logins: list[DemoLogin], path: Path | None = None) -> Path:
    """Write the login table to ``docs/DEMO_LOGINS.md``."""
    target = path or _DOCS_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    body = (
        "# Cadence demo logins\n\n"
        "Generated by `uv run manage.py seed-demo`. All demo users share the "
        f"password `{DEMO_PASSWORD}`.\n\n"
        f"{render_logins_table(logins)}\n"
    )
    target.write_text(body, encoding="utf-8")
    return target

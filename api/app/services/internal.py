"""Internal (back-office) services: metadata and counts, never plan text.

Staff read organisations, users, AI usage and the audit log. Every method here
selects only metadata — counts, roles, timestamps, token usage — so no plan,
task, AI prompt or model-output text can leak through an ``/internal`` response
(root ``AGENTS.md`` §6 privacy call).

All counts are computed with grouped aggregates or correlated scalar subqueries;
no route issues one query per row (no N+1). Services only ``flush()``; routers
commit once.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    ForbiddenException,
    ResourceNotFoundException,
    ValidationException,
)
from app.models import AiCall, Membership, Organization, Plan, StaffAction, Team, User

_FAILURE_STATUSES = ("error", "timeout")
# AI-usage window bounds (docs/API.md §"/internal").
USAGE_DEFAULT_DAYS = 30
USAGE_MAX_DAYS = 90


def validate_usage_range(date_from: date, date_to: date) -> None:
    """Reject an inverted or too-long AI-usage window with ``422 validation_error``."""
    if date_from > date_to:
        raise ValidationException("'from' must not be after 'to'")
    if (date_to - date_from).days > USAGE_MAX_DAYS:
        raise ValidationException(f"date range must be at most {USAGE_MAX_DAYS} days")


def _org_scalar_count(model: Any):
    """A correlated ``COUNT`` of ``model`` rows belonging to the org row."""
    return (
        select(func.count(model.id))
        .where(model.org_id == Organization.id)
        .correlate(Organization)
        .scalar_subquery()
    )


def _org_payload(org: Organization) -> dict[str, Any]:
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "is_suspended": org.is_suspended,
        "suspended_at": org.suspended_at,
        "suspended_reason": org.suspended_reason,
        "last_active_at": org.last_active_at,
        "created_at": org.created_at,
    }


def _user_payload(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "name": user.name,
        "email": user.email,
        "is_admin": user.is_platform_staff,
        "is_active": user.is_active,
    }


class InternalOrgService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_orgs(
        self, *, q: str | None, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        """A page of orgs (newest first) with member/team/plan counts, in 2 queries."""
        member_count = _org_scalar_count(Membership)
        team_count = _org_scalar_count(Team)
        plan_count = _org_scalar_count(Plan)
        statement = select(Organization, member_count, team_count, plan_count)
        if q:
            pattern = f"%{q}%"
            statement = statement.where(
                or_(
                    Organization.name.ilike(pattern),
                    Organization.slug.ilike(pattern),
                )
            )
        total = int(
            await self.session.scalar(
                select(func.count()).select_from(statement.subquery())
            )
            or 0
        )
        rows = (
            await self.session.execute(
                statement.order_by(
                    Organization.created_at.desc(), Organization.id.desc()
                )
                .limit(limit)
                .offset(offset)
            )
        ).all()
        items = [
            {
                **_org_payload(org),
                "member_count": members,
                "team_count": teams,
                "plan_count": plans,
            }
            for org, members, teams, plans in rows
        ]
        return items, total

    async def get_org(self, org_id: uuid.UUID) -> dict[str, Any]:
        """One org's counts plus its members (email, name, role) — no plan text."""
        member_count = _org_scalar_count(Membership)
        team_count = _org_scalar_count(Team)
        plan_count = _org_scalar_count(Plan)
        row = (
            await self.session.execute(
                select(Organization, member_count, team_count, plan_count).where(
                    Organization.id == org_id
                )
            )
        ).one_or_none()
        if row is None:
            raise ResourceNotFoundException("Organization not found")
        org, members, teams, plans = row
        return {
            **_org_payload(org),
            "member_count": members,
            "team_count": teams,
            "plan_count": plans,
            "members": await self._members(org_id),
        }

    async def suspend(
        self, org_id: uuid.UUID, *, staff: User, reason: str
    ) -> Organization:
        """Suspend an org. Idempotent: a repeat writes no extra audit row.

        The org row is locked ``FOR UPDATE`` so two concurrent suspends
        serialize: the second re-reads ``is_suspended=True`` after the first
        commits and writes no duplicate audit row.
        """
        org = await self._get_for_update(org_id)
        if not org.is_suspended:
            org.is_suspended = True
            org.suspended_at = datetime.now(UTC)
            org.suspended_reason = reason
            self.session.add(
                StaffAction(
                    staff_user_id=staff.id,
                    action="org_suspended",
                    target_type="organization",
                    target_id=org.id,
                    reason=reason,
                )
            )
            await self.session.flush()
        return org

    async def reinstate(self, org_id: uuid.UUID, *, staff: User) -> Organization:
        """Reinstate a suspended org. Idempotent: a repeat writes no audit row."""
        org = await self._get_for_update(org_id)
        if org.is_suspended:
            org.is_suspended = False
            org.suspended_at = None
            org.suspended_reason = None
            self.session.add(
                StaffAction(
                    staff_user_id=staff.id,
                    action="org_reinstated",
                    target_type="organization",
                    target_id=org.id,
                )
            )
            await self.session.flush()
        return org

    async def _members(self, org_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = (
            await self.session.execute(
                select(Membership.role, User.email, User.first_name, User.last_name)
                .join(User, User.id == Membership.user_id)
                .where(Membership.org_id == org_id)
                .order_by(Membership.created_at.asc())
            )
        ).all()
        return [
            {"email": email, "name": f"{first} {last}".strip(), "role": role}
            for role, email, first, last in rows
        ]

    async def _get_for_update(self, org_id: uuid.UUID) -> Organization:
        """Fetch the org with ``SELECT ... FOR UPDATE`` to serialize mutations."""
        org = await self.session.scalar(
            select(Organization).where(Organization.id == org_id).with_for_update()
        )
        if org is None:
            raise ResourceNotFoundException("Organization not found")
        return org


class InternalUserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_users(
        self, *, q: str | None, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        """A page of users (newest first) with their org roles, in 2 queries."""
        statement = select(User)
        if q:
            pattern = f"%{q}%"
            statement = statement.where(
                or_(
                    User.email.ilike(pattern),
                    User.first_name.ilike(pattern),
                    User.last_name.ilike(pattern),
                    func.concat(User.first_name, " ", User.last_name).ilike(pattern),
                )
            )
        total = int(
            await self.session.scalar(
                select(func.count()).select_from(statement.subquery())
            )
            or 0
        )
        users = (
            (
                await self.session.execute(
                    statement.order_by(User.created_at.desc(), User.id.desc())
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )
        orgs_by_user = await self._orgs_by_user([user.id for user in users])
        items = [
            {**_user_payload(user), "orgs": orgs_by_user.get(user.id, [])}
            for user in users
        ]
        return items, total

    async def get_user(self, user_id: uuid.UUID) -> dict[str, Any]:
        user = await self._get_or_404(user_id)
        orgs_by_user = await self._orgs_by_user([user.id])
        return {**_user_payload(user), "orgs": orgs_by_user.get(user.id, [])}

    async def deactivate(
        self, user_id: uuid.UUID, *, staff: User, reason: str
    ) -> dict[str, Any]:
        """Deactivate a user. Staff cannot deactivate themselves or another staffer.

        Idempotent for an already-inactive user (no extra audit row). A live
        token stops working immediately because ``is_active`` is read from the DB
        on every request.
        """
        target = await self._get_for_update(user_id)
        if target.id == staff.id:
            raise ForbiddenException("You cannot deactivate your own account")
        if target.is_platform_staff:
            raise ForbiddenException("Staff accounts cannot be deactivated here")
        if target.is_active:
            target.is_active = False
            self.session.add(
                StaffAction(
                    staff_user_id=staff.id,
                    action="user_deactivated",
                    target_type="user",
                    target_id=target.id,
                    reason=reason,
                )
            )
            await self.session.flush()
        orgs_by_user = await self._orgs_by_user([target.id])
        return {**_user_payload(target), "orgs": orgs_by_user.get(target.id, [])}

    async def reactivate(self, user_id: uuid.UUID, *, staff: User) -> dict[str, Any]:
        """Reactivate a user. Idempotent for an already-active user."""
        target = await self._get_for_update(user_id)
        if not target.is_active:
            target.is_active = True
            self.session.add(
                StaffAction(
                    staff_user_id=staff.id,
                    action="user_reactivated",
                    target_type="user",
                    target_id=target.id,
                )
            )
            await self.session.flush()
        orgs_by_user = await self._orgs_by_user([target.id])
        return {**_user_payload(target), "orgs": orgs_by_user.get(target.id, [])}

    async def _orgs_by_user(
        self, user_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[dict[str, Any]]]:
        if not user_ids:
            return {}
        rows = (
            await self.session.execute(
                select(
                    Membership.user_id,
                    Organization.id,
                    Organization.name,
                    Membership.role,
                )
                .join(Organization, Organization.id == Membership.org_id)
                .where(Membership.user_id.in_(user_ids))
                .order_by(Organization.name.asc())
            )
        ).all()
        result: dict[uuid.UUID, list[dict[str, Any]]] = {}
        for user_id, org_id, name, role in rows:
            result.setdefault(user_id, []).append(
                {"id": org_id, "name": name, "role": role}
            )
        return result

    async def _get_or_404(self, user_id: uuid.UUID) -> User:
        user = await self.session.scalar(select(User).where(User.id == user_id))
        if user is None:
            raise ResourceNotFoundException("User not found")
        return user

    async def _get_for_update(self, user_id: uuid.UUID) -> User:
        user = await self.session.scalar(
            select(User).where(User.id == user_id).with_for_update()
        )
        if user is None:
            raise ResourceNotFoundException("User not found")
        return user


class InternalAiUsageService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def window(date_from: date, date_to: date) -> tuple[datetime, datetime]:
        """``[start, end)`` UTC datetimes covering ``from``..``to`` inclusive."""
        start = datetime.combine(date_from, time.min, tzinfo=UTC)
        end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
        return start, end

    async def usage(
        self, *, date_from: date, date_to: date, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        """Per-org AI usage over the window, in ONE grouped query.

        ``calls`` counts every row (including ``disabled``); ``failures`` counts
        ``error``/``timeout``; ``rate_limited`` is reported separately so the two
        are never conflated. ``p50`` uses Postgres ``percentile_cont``.
        """
        start, end = self.window(date_from, date_to)
        calls = func.count(AiCall.id)
        failures = func.count(AiCall.id).filter(AiCall.status.in_(_FAILURE_STATUSES))
        rate_limited = func.count(AiCall.id).filter(AiCall.status == "rate_limited")
        grouped = (
            select(
                AiCall.org_id.label("org_id"),
                Organization.name.label("org_name"),
                calls.label("calls"),
                failures.label("failures"),
                rate_limited.label("rate_limited"),
                func.percentile_cont(0.5).within_group(AiCall.latency_ms).label("p50"),
                func.avg(AiCall.latency_ms).label("avg"),
                func.coalesce(func.sum(AiCall.input_tokens), 0).label("input_tokens"),
                func.coalesce(func.sum(AiCall.output_tokens), 0).label("output_tokens"),
            )
            .join(Organization, Organization.id == AiCall.org_id)
            .where(AiCall.created_at >= start, AiCall.created_at < end)
            .group_by(AiCall.org_id, Organization.name)
            .subquery()
        )
        total = int(
            await self.session.scalar(select(func.count()).select_from(grouped)) or 0
        )
        rows = (
            await self.session.execute(
                select(grouped)
                .order_by(grouped.c.calls.desc(), grouped.c.org_name.asc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        items = [
            {
                "org_id": row.org_id,
                "org_name": row.org_name,
                "calls": int(row.calls),
                "failures": int(row.failures),
                "rate_limited": int(row.rate_limited),
                "p50_latency_ms": (
                    round(float(row.p50), 1) if row.p50 is not None else None
                ),
                "avg_latency_ms": (
                    round(float(row.avg), 1) if row.avg is not None else None
                ),
                "input_tokens": int(row.input_tokens or 0),
                "output_tokens": int(row.output_tokens or 0),
            }
            for row in rows
        ]
        return items, total

    async def daily(
        self, *, org_id: uuid.UUID, date_from: date, date_to: date
    ) -> list[dict[str, Any]]:
        """One zero-filled ``(date, calls, failures, rate_limited)`` per day."""
        org = await self.session.scalar(
            select(Organization.id).where(Organization.id == org_id)
        )
        if org is None:
            raise ResourceNotFoundException("Organization not found")
        start, end = self.window(date_from, date_to)
        day = func.date_trunc("day", func.timezone("UTC", AiCall.created_at))
        rows = (
            await self.session.execute(
                select(
                    day.label("day"),
                    func.count(AiCall.id).label("calls"),
                    func.count(AiCall.id)
                    .filter(AiCall.status.in_(_FAILURE_STATUSES))
                    .label("failures"),
                    func.count(AiCall.id)
                    .filter(AiCall.status == "rate_limited")
                    .label("rate_limited"),
                )
                .where(
                    AiCall.org_id == org_id,
                    AiCall.created_at >= start,
                    AiCall.created_at < end,
                )
                .group_by(day)
                .order_by(day)
            )
        ).all()
        by_day = {row.day.date(): row for row in rows}
        days: list[dict[str, Any]] = []
        cursor = date_from
        while cursor <= date_to:
            row = by_day.get(cursor)
            days.append(
                {
                    "date": cursor,
                    "calls": int(row.calls) if row else 0,
                    "failures": int(row.failures) if row else 0,
                    "rate_limited": int(row.rate_limited) if row else 0,
                }
            )
            cursor += timedelta(days=1)
        return days


class InternalAuditService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_actions(
        self, *, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        """A page of staff actions (newest first) with actor and target names."""
        total = int(
            await self.session.scalar(select(func.count()).select_from(StaffAction))
            or 0
        )
        rows = (
            await self.session.execute(
                select(StaffAction, User.email, User.first_name, User.last_name)
                .join(User, User.id == StaffAction.staff_user_id)
                .order_by(StaffAction.created_at.desc(), StaffAction.id.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        org_ids = {
            action.target_id
            for action, *_ in rows
            if action.target_type == "organization"
        }
        user_ids = {
            action.target_id for action, *_ in rows if action.target_type == "user"
        }
        org_names: dict[uuid.UUID, str] = {}
        if org_ids:
            org_rows = (
                await self.session.execute(
                    select(Organization.id, Organization.name).where(
                        Organization.id.in_(org_ids)
                    )
                )
            ).all()
            org_names = {org_id: name for org_id, name in org_rows}
        user_emails: dict[uuid.UUID, str] = {}
        if user_ids:
            user_rows = (
                await self.session.execute(
                    select(User.id, User.email).where(User.id.in_(user_ids))
                )
            ).all()
            user_emails = {user_id: email for user_id, email in user_rows}
        items = []
        for action, email, first, last in rows:
            if action.target_type == "organization":
                target_name = org_names.get(action.target_id)
            else:
                target_name = user_emails.get(action.target_id)
            items.append(
                {
                    "id": action.id,
                    "created_at": action.created_at,
                    "staff_user_id": action.staff_user_id,
                    "staff_email": email,
                    "staff_name": f"{first} {last}".strip(),
                    "action": action.action,
                    "target_type": action.target_type,
                    "target_id": action.target_id,
                    "target_name": target_name or "(deleted)",
                    "reason": action.reason,
                }
            )
        return items, total

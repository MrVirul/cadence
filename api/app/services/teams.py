import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import and_, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.app.org_access import OrgContext, get_in_org
from app.clock import current_week_start
from app.exceptions import (
    ConflictException,
    ResourceNotFoundException,
    RoleForbiddenException,
    ValidationException,
)
from app.models import Membership, Plan, Task, Team, TeamMember, User

_ADMIN_ROLES = {"admin", "owner"}


class TeamService:
    """Teams, team membership and team leads.

    Read access (docs/API.md "Access semantics"): an org ``admin``/``owner``
    sees every team; a plain ``member`` sees only the teams they belong to.
    When the caller cannot read a team the route answers ``404 not_found``;
    when they can read it but are not an admin/owner the route answers ``403
    forbidden``. Only admins/owners may write.

    The service flushes; the router commits once (api/AGENTS.md).
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_teams(
        self, *, ctx: OrgContext, limit: int, offset: int
    ) -> tuple[Sequence[tuple[Team, int]], int]:
        """Page of ``(team, member_count)`` visible to the caller."""
        conditions = [Team.org_id == ctx.org.id]
        if ctx.role not in _ADMIN_ROLES:
            conditions.append(
                Team.id.in_(
                    select(TeamMember.team_id).where(
                        TeamMember.membership_id == ctx.membership.id
                    )
                )
            )
        total = await self.session.scalar(
            select(func.count()).select_from(Team).where(*conditions)
        )
        member_count = func.count(TeamMember.id).label("member_count")
        result = await self.session.execute(
            select(Team, member_count)
            .outerjoin(TeamMember, TeamMember.team_id == Team.id)
            .where(*conditions)
            .group_by(Team.id)
            .order_by(Team.created_at.desc(), Team.id)
            .limit(limit)
            .offset(offset)
        )
        return [(team, count) for team, count in result.all()], total or 0

    async def get_detail(
        self, *, ctx: OrgContext, team_id: uuid.UUID
    ) -> tuple[Team, list[tuple[Membership, User]]]:
        """A team the caller can read, plus its members (with users)."""
        team = await self.get_for_read(ctx=ctx, team_id=team_id)
        return team, await self.list_members(team_id=team.id)

    async def list_members(
        self, *, team_id: uuid.UUID
    ) -> list[tuple[Membership, User]]:
        """The team's memberships joined to their users, name-ordered."""
        result = await self.session.execute(
            select(Membership, User)
            .join(TeamMember, TeamMember.membership_id == Membership.id)
            .join(User, User.id == Membership.user_id)
            .where(TeamMember.team_id == team_id)
            .order_by(User.first_name, User.last_name, Membership.id)
        )
        return [(membership, user) for membership, user in result.all()]

    async def get_for_read(self, *, ctx: OrgContext, team_id: uuid.UUID) -> Team:
        """Resolve a team for reading; ``404`` when the caller has no access."""
        team = await get_in_org(self.session, Team, team_id, ctx.org.id)
        if ctx.role in _ADMIN_ROLES or await self._is_member(
            team.id, ctx.membership.id
        ):
            return team
        raise ResourceNotFoundException("Team not found")

    async def get_for_view(self, *, ctx: OrgContext, team_id: uuid.UUID) -> Team:
        """Resolve a team for the lead/admin week & history view.

        Read-then-act, matching the global 404/403 rule:

        - an org owner/admin may view any team (``200``);
        - the team's **lead** may view their own team (``200``);
        - another member of the team can *read* the team but may not view its
          week/history, so they get ``403 forbidden``;
        - everyone else cannot read the team at all, so they get an
          indistinguishable ``404 not_found``.
        """
        team = await get_in_org(self.session, Team, team_id, ctx.org.id)
        if ctx.role in _ADMIN_ROLES or team.lead_membership_id == ctx.membership.id:
            return team
        if await self._is_member(team.id, ctx.membership.id):
            raise RoleForbiddenException()
        raise ResourceNotFoundException("Team not found")

    async def team_week(
        self, *, ctx: OrgContext, team_id: uuid.UUID, week: date | None, today: date
    ) -> tuple[date, list[tuple[Membership, User, Plan | None, int, int]]]:
        """One row per current team member for ``week`` (default: this week).

        Only plans filed under *this* team count: a member who belongs to two
        teams files their single weekly plan under one of them, so their plan
        in the other team reads as ``not_started`` here. Members with no plan
        that week still appear, as an empty row.
        """
        team = await self.get_for_view(ctx=ctx, team_id=team_id)
        week_start = self._resolve_week(week, today)
        return week_start, await self._week_rows(team=team, week_start=week_start)

    async def team_history(
        self,
        *,
        ctx: OrgContext,
        team_id: uuid.UUID,
        today: date,
        limit: int,
        offset: int,
    ) -> tuple[list[tuple[date, int, int, int, int, int]], int, float | None]:
        """Past weeks of a team, newest first, with a shipped rate for the page.

        ``total`` (for pagination) is the number of past weeks that have any
        plan. Each week's ``total`` counts every plan filed under this team that
        week, whatever its status, so unfinished plans count against the shipped
        rate. ``shipped_rate`` is shipped plans ÷ all plans over the *returned
        page* (``None`` when the page has no plans).
        """
        team = await self.get_for_view(ctx=ctx, team_id=team_id)
        conditions = (
            Plan.org_id == team.org_id,
            Plan.team_id == team.id,
            Plan.week_start < current_week_start(today),
        )
        week_count = await self.session.scalar(
            select(func.count(func.distinct(Plan.week_start))).where(*conditions)
        )
        result = await self.session.execute(
            select(
                Plan.week_start,
                func.count(Plan.id).label("total"),
                func.count(Plan.id)
                .filter(Plan.status == "submitted")
                .label("submitted_count"),
                func.count(Plan.id)
                .filter(Plan.status == "approved")
                .label("approved_count"),
                func.count(Plan.id).filter(Plan.status == "done").label("done_count"),
                func.count(Plan.id)
                .filter(Plan.shipped.is_(True))
                .label("shipped_count"),
            )
            .where(*conditions)
            .group_by(Plan.week_start)
            .order_by(Plan.week_start.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = [
            (
                row.week_start,
                int(row.total),
                int(row.submitted_count),
                int(row.approved_count),
                int(row.done_count),
                int(row.shipped_count),
            )
            for row in result.all()
        ]
        page_plans = sum(row[1] for row in rows)
        page_shipped = sum(row[5] for row in rows)
        shipped_rate = round(page_shipped / page_plans, 4) if page_plans else None
        return rows, week_count or 0, shipped_rate

    async def _week_rows(
        self, *, team: Team, week_start: date
    ) -> list[tuple[Membership, User, Plan | None, int, int]]:
        """Grouped read of every team member with their plan and task counters.

        One aggregate query: ``team_members`` join members/users, left-joined to
        the single plan filed under this team for the week, left-joined to its
        tasks. No per-member query (docs/API.md conventions).
        """
        tasks_done = func.count(Task.id).filter(Task.status == "done")
        tasks_total = func.count(Task.id)
        result = await self.session.execute(
            select(Membership, User, Plan, tasks_done, tasks_total)
            .select_from(TeamMember)
            .join(Membership, Membership.id == TeamMember.membership_id)
            .join(User, User.id == Membership.user_id)
            .outerjoin(
                Plan,
                and_(
                    Plan.membership_id == Membership.id,
                    Plan.week_start == week_start,
                    Plan.team_id == team.id,
                ),
            )
            .outerjoin(Task, Task.plan_id == Plan.id)
            .where(
                TeamMember.team_id == team.id,
                TeamMember.org_id == team.org_id,
            )
            .group_by(Membership.id, User.id, Plan.id)
            .order_by(User.first_name, User.last_name, Membership.id)
        )
        return [
            (membership, user, plan, int(done), int(total))
            for membership, user, plan, done, total in result.all()
        ]

    @staticmethod
    def _resolve_week(week: date | None, today: date) -> date:
        """``week`` when it is a Monday, else the current week; non-Monday 422."""
        if week is None:
            return current_week_start(today)
        if week.weekday() != 0:
            raise ValidationException("week must be a Monday")
        return week

    async def get_for_write(
        self, *, ctx: OrgContext, team_id: uuid.UUID, lock: bool = False
    ) -> Team:
        """Resolve a team for writing, with the 404/403 split.

        An admin/owner may act. A plain member of the team can *see* it, so
        they get ``403 forbidden``; anyone else has no read access and gets an
        indistinguishable ``404 not_found``. ``lock`` takes the team row
        ``FOR UPDATE`` for the rest of the transaction.
        """
        team = await get_in_org(
            self.session, Team, team_id, ctx.org.id, for_update=lock
        )
        if ctx.role in _ADMIN_ROLES:
            return team
        if await self._is_member(team.id, ctx.membership.id):
            raise RoleForbiddenException()
        raise ResourceNotFoundException("Team not found")

    async def create(
        self, *, ctx: OrgContext, name: str, lead_membership_id: uuid.UUID | None
    ) -> Team:
        """Create a team, optionally with a lead.

        A lead must be a member of their team, so creating a team with a lead
        also adds that membership to the team. A cross-org lead id is a ``404``
        and writes nothing; a duplicate name is a ``409``.
        """
        lead: Membership | None = None
        if lead_membership_id is not None:
            lead = await get_in_org(
                self.session, Membership, lead_membership_id, ctx.org.id
            )
        if await self._name_taken(ctx.org.id, name):
            raise ConflictException("A team with this name already exists")

        team = Team(
            org_id=ctx.org.id, name=name, lead_membership_id=lead.id if lead else None
        )
        self.session.add(team)
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            raise ConflictException("A team with this name already exists")
        if lead is not None:
            self.session.add(
                TeamMember(org_id=ctx.org.id, team_id=team.id, membership_id=lead.id)
            )
            await self.session.flush()
        return team

    async def rename(self, *, ctx: OrgContext, team_id: uuid.UUID, name: str) -> Team:
        """Rename a team; a duplicate name in the org is a ``409``."""
        team = await self.get_for_write(ctx=ctx, team_id=team_id)
        if await self._name_taken(ctx.org.id, name, exclude_id=team.id):
            raise ConflictException("A team with this name already exists")
        team.name = name
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            raise ConflictException("A team with this name already exists")
        return team

    async def delete(self, *, ctx: OrgContext, team_id: uuid.UUID) -> None:
        """Delete a team; ``409`` while the team still has plans."""
        team = await self.get_for_write(ctx=ctx, team_id=team_id)
        plan_count = await self.session.scalar(
            select(func.count()).select_from(Plan).where(Plan.team_id == team.id)
        )
        if plan_count:
            raise ConflictException(
                "This team still has plans; reassign or remove them first"
            )
        await self.session.delete(team)
        await self.session.flush()

    async def replace_members(
        self, *, ctx: OrgContext, team_id: uuid.UUID, membership_ids: list[uuid.UUID]
    ) -> Team:
        """Replace the whole member set in one transaction.

        The team row is locked (``SELECT ... FOR UPDATE``) so two concurrent
        replacements serialize and can never race into a dangling lead. Every
        id must be a membership of this org *before* anything is written — a
        cross-org id is a ``404`` and leaves the set unchanged. Removing the
        current lead from the set clears ``lead_membership_id`` (documented
        decision: clear, never reject).
        """
        team = await self.get_for_write(ctx=ctx, team_id=team_id, lock=True)

        memberships: list[Membership] = []
        for membership_id in dict.fromkeys(membership_ids):
            memberships.append(
                await get_in_org(self.session, Membership, membership_id, ctx.org.id)
            )

        await self.session.execute(
            delete(TeamMember).where(TeamMember.team_id == team.id)
        )
        member_ids = {membership.id for membership in memberships}
        for membership in memberships:
            self.session.add(
                TeamMember(
                    org_id=ctx.org.id,
                    team_id=team.id,
                    membership_id=membership.id,
                )
            )
        if (
            team.lead_membership_id is not None
            and team.lead_membership_id not in member_ids
        ):
            team.lead_membership_id = None
        await self.session.flush()
        return team

    async def set_lead(
        self, *, ctx: OrgContext, team_id: uuid.UUID, membership_id: uuid.UUID
    ) -> Team:
        """Set a team's lead; the lead must already be a member (``422``)."""
        team = await self.get_for_write(ctx=ctx, team_id=team_id, lock=True)
        membership = await get_in_org(
            self.session, Membership, membership_id, ctx.org.id
        )
        if not await self._is_member(team.id, membership.id):
            raise ValidationException("The team lead must be a member of the team")
        team.lead_membership_id = membership.id
        await self.session.flush()
        return team

    async def member_count(self, team_id: uuid.UUID) -> int:
        return (
            await self.session.scalar(
                select(func.count())
                .select_from(TeamMember)
                .where(TeamMember.team_id == team_id)
            )
        ) or 0

    async def _is_member(self, team_id: uuid.UUID, membership_id: uuid.UUID) -> bool:
        return (
            await self.session.scalar(
                select(TeamMember.id).where(
                    TeamMember.team_id == team_id,
                    TeamMember.membership_id == membership_id,
                )
            )
        ) is not None

    async def _name_taken(
        self, org_id: uuid.UUID, name: str, *, exclude_id: uuid.UUID | None = None
    ) -> bool:
        statement = select(Team.id).where(Team.org_id == org_id, Team.name == name)
        if exclude_id is not None:
            statement = statement.where(Team.id != exclude_id)
        return await self.session.scalar(statement) is not None

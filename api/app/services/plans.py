"""Plans, tasks and the plan state machine (docs/DATA_MODEL.md §"Plan state machine").

This is the ONE module that decides plan transitions. Every transition:

1. resolves the plan through :meth:`PlanService.get_readable_plan`, which applies
   the global read-then-act rule (no read access → ``404 not_found``, identical
   to a missing plan);
2. checks the caller is allowed to act (else ``403 forbidden``);
3. rejects a move the state machine does not allow (``409 invalid_transition``);
4. applies the business validations (else ``422 validation_error``);
5. writes **exactly one** ``plan_events`` row and the side-effect columns.

Services only ``flush()``; the router commits once.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.app.org_access import OrgContext, get_in_org
from app.api.app.schemas import TaskInput
from app.clock import current_week_start, latest_week_start
from app.exceptions import (
    ConflictException,
    InvalidTransitionException,
    ResourceNotFoundException,
    RoleForbiddenException,
    ValidationException,
)
from app.models import Membership, Plan, PlanEvent, Task, Team, TeamMember, User

_ADMIN_ROLES = {"admin", "owner"}

# The plan state machine. A (status, action) pair absent from this table is a
# 409 invalid_transition. Keep this the only place transitions are declared.
PLAN_TRANSITIONS: dict[str, dict[str, str]] = {
    "draft": {"submit": "submitted"},
    "submitted": {"withdraw": "draft", "approve": "approved", "send_back": "draft"},
    "approved": {"close": "done"},
    "done": {},
}

# Action → the `plan_events.action` value is written explicitly by each
# transition method (`"submitted"`, `"withdrawn"`, ...), so the two names can
# never silently drift.

_MAX_SUB_GOALS = 5
_MAX_GTM_GOALS = 5


def transition_target(status: str, action: str) -> str | None:
    """The status ``action`` moves a plan in ``status`` to, or ``None``."""
    return PLAN_TRANSITIONS.get(status, {}).get(action)


class PlanService:
    """Plans and tasks for one org context.

    Read access (docs/API.md "Access semantics"): the author, the lead of
    ``plan.team_id``, or any org owner/admin. Everyone else gets ``404``.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # --- read helpers ---------------------------------------------------

    async def get_readable_plan(
        self, *, ctx: OrgContext, plan_id: uuid.UUID, lock: bool = False
    ) -> Plan:
        """Resolve a plan the caller may read; ``404`` when they may not.

        ``lock`` takes the plan row ``SELECT ... FOR UPDATE`` for the rest of
        the transaction, so concurrent transitions serialize: the loser waits,
        then re-reads the committed status and answers ``409``.
        """
        plan = await get_in_org(
            self.session, Plan, plan_id, ctx.org.id, for_update=lock
        )
        if await self._can_read(ctx=ctx, plan=plan):
            return plan
        raise ResourceNotFoundException("Plan not found")

    async def _can_read(self, *, ctx: OrgContext, plan: Plan) -> bool:
        if plan.membership_id == ctx.membership.id:
            return True
        if ctx.role in _ADMIN_ROLES:
            return True
        return await self._is_team_lead(plan.team_id, ctx.membership.id)

    async def _is_team_lead(self, team_id: uuid.UUID, membership_id: uuid.UUID) -> bool:
        return (
            await self.session.scalar(
                select(Team.id).where(
                    Team.id == team_id, Team.lead_membership_id == membership_id
                )
            )
        ) is not None

    async def _is_team_member(
        self, team_id: uuid.UUID, membership_id: uuid.UUID
    ) -> bool:
        return (
            await self.session.scalar(
                select(TeamMember.id).where(
                    TeamMember.team_id == team_id,
                    TeamMember.membership_id == membership_id,
                )
            )
        ) is not None

    async def person(self, membership_id: uuid.UUID) -> tuple[Membership, User]:
        """The membership and user for a plan actor/author response."""
        row = (
            await self.session.execute(
                select(Membership, User)
                .join(User, User.id == Membership.user_id)
                .where(Membership.id == membership_id)
            )
        ).one_or_none()
        if row is None:
            raise ResourceNotFoundException("Membership not found")
        membership, user = row
        return membership, user

    async def list_tasks(self, plan_id: uuid.UUID) -> Sequence[Task]:
        result = await self.session.execute(
            select(Task)
            .where(Task.plan_id == plan_id)
            .order_by(Task.position, Task.created_at, Task.id)
        )
        return result.scalars().all()

    async def list_events(self, plan_id: uuid.UUID) -> Sequence[PlanEvent]:
        result = await self.session.execute(
            select(PlanEvent)
            .where(PlanEvent.plan_id == plan_id)
            .order_by(PlanEvent.created_at, PlanEvent.id)
        )
        return result.scalars().all()

    async def get_detail(
        self, *, ctx: OrgContext, plan_id: uuid.UUID
    ) -> tuple[Plan, Membership, User]:
        plan = await self.get_readable_plan(ctx=ctx, plan_id=plan_id)
        membership, user = await self.person(plan.membership_id)
        return plan, membership, user

    # --- listing --------------------------------------------------------

    async def list_plans(
        self,
        *,
        ctx: OrgContext,
        week: date | None,
        mine: bool,
        limit: int,
        offset: int,
    ) -> tuple[Sequence[tuple[Plan, Membership, User, int, int]], int]:
        """Page of plans the caller can read, newest week first.

        A plain ``member`` sees only their own plans; a team lead also sees the
        plans of the teams they lead; an admin/owner sees the whole org.
        ``mine=true`` narrows any caller to their own plans.
        """
        conditions = [Plan.org_id == ctx.org.id]
        if mine:
            conditions.append(Plan.membership_id == ctx.membership.id)
        elif ctx.role not in _ADMIN_ROLES:
            led_teams = select(Team.id).where(
                Team.org_id == ctx.org.id,
                Team.lead_membership_id == ctx.membership.id,
            )
            conditions.append(
                or_(
                    Plan.membership_id == ctx.membership.id,
                    Plan.team_id.in_(led_teams),
                )
            )
        if week is not None:
            conditions.append(Plan.week_start == week)

        total = await self.session.scalar(
            select(func.count()).select_from(Plan).where(*conditions)
        )
        tasks_done = (
            func.count(Task.id).filter(Task.status == "done").label("tasks_done")
        )
        tasks_total = func.count(Task.id).label("tasks_total")
        result = await self.session.execute(
            select(Plan, Membership, User, tasks_done, tasks_total)
            .join(Membership, Membership.id == Plan.membership_id)
            .join(User, User.id == Membership.user_id)
            .outerjoin(Task, Task.plan_id == Plan.id)
            .where(*conditions)
            .group_by(Plan.id, Membership.id, User.id)
            .order_by(Plan.week_start.desc(), Plan.created_at.desc(), Plan.id)
            .limit(limit)
            .offset(offset)
        )
        return (
            [
                (plan, membership, user, int(done), int(total_))
                for plan, membership, user, done, total_ in result.all()
            ],
            total or 0,
        )

    # --- create / edit --------------------------------------------------

    async def create(
        self,
        *,
        ctx: OrgContext,
        today: date,
        week_start: date,
        team_id: uuid.UUID,
        tasks_in: list[TaskInput],
    ) -> Plan:
        """Create the caller's own draft for ``week_start``."""
        self._validate_week_start(week_start, today)
        team = await self._team_for_author(ctx=ctx, team_id=team_id)
        self._validate_task_counts(tasks_in)

        exists = await self.session.scalar(
            select(Plan.id).where(
                Plan.membership_id == ctx.membership.id,
                Plan.week_start == week_start,
            )
        )
        if exists is not None:
            raise ConflictException("A plan already exists for this week")

        plan = Plan(
            org_id=ctx.org.id,
            membership_id=ctx.membership.id,
            team_id=team.id,
            week_start=week_start,
        )
        self.session.add(plan)
        try:
            await self.session.flush()
        except IntegrityError:
            # Concurrent create for the same (membership, week): the unique
            # constraint is the source of truth; the loser answers 409.
            await self.session.rollback()
            raise ConflictException("A plan already exists for this week")

        for index, task_in in enumerate(tasks_in):
            self.session.add(self._new_task(plan, task_in, index))
        await self.session.flush()
        return plan

    async def replace_content(
        self,
        *,
        ctx: OrgContext,
        plan_id: uuid.UUID,
        team_id: uuid.UUID | None,
        tasks_in: list[TaskInput],
    ) -> Plan:
        """Replace a draft's tasks (matched by id) and optionally its team."""
        plan = await self.get_readable_plan(ctx=ctx, plan_id=plan_id, lock=True)
        if plan.membership_id != ctx.membership.id:
            raise RoleForbiddenException()
        if plan.status != "draft":
            raise InvalidTransitionException(
                "Plan content can only be edited while it is a draft"
            )
        self._validate_task_counts(tasks_in)

        if team_id is not None and team_id != plan.team_id:
            team = await self._team_for_author(ctx=ctx, team_id=team_id)
            plan.team_id = team.id

        # Resolve every referenced id BEFORE writing anything: an id that lives
        # on another plan (or in another org) is a 404 and nothing changes.
        referenced: dict[uuid.UUID, Task] = {}
        for task_in in tasks_in:
            if task_in.id is None:
                continue
            if task_in.id in referenced:
                raise ValidationException("Duplicate task id in request")
            task = await get_in_org(self.session, Task, task_in.id, ctx.org.id)
            if task.plan_id != plan.id:
                raise ResourceNotFoundException("Task not found")
            referenced[task_in.id] = task

        existing = {task.id: task for task in await self.list_tasks(plan.id)}

        # Phase 1: delete removed tasks and update kept ones in place, then
        # flush so a kind change frees any partial-unique slot before inserts.
        for task in existing.values():
            if task.id not in referenced:
                await self.session.delete(task)
        for index, task_in in enumerate(tasks_in):
            if task_in.id is not None:
                task = referenced[task_in.id]
                task.kind = task_in.kind
                task.title = task_in.title
                task.why = task_in.why
                task.position = self._position(task_in, index)
        await self.session.flush()

        # Phase 2: insert new tasks.
        for index, task_in in enumerate(tasks_in):
            if task_in.id is None:
                self.session.add(self._new_task(plan, task_in, index))
        await self.session.flush()
        return plan

    async def tick_task(
        self, *, ctx: OrgContext, task_id: uuid.UUID, status: str
    ) -> Task:
        """Toggle a task's status; author only, plan draft or approved."""
        task = await get_in_org(self.session, Task, task_id, ctx.org.id)
        plan = await self.get_readable_plan(ctx=ctx, plan_id=task.plan_id)
        if plan.membership_id != ctx.membership.id:
            raise RoleForbiddenException()
        if plan.status not in ("draft", "approved"):
            raise InvalidTransitionException(
                "Tasks cannot be ticked in the plan's current state"
            )
        task.status = status
        task.done_at = datetime.now(UTC) if status == "done" else None
        await self.session.flush()
        return task

    # --- transitions ----------------------------------------------------

    async def submit(self, *, ctx: OrgContext, plan_id: uuid.UUID, today: date) -> Plan:
        """``draft`` → ``submitted`` (author only, plan complete)."""
        plan = await self.get_readable_plan(ctx=ctx, plan_id=plan_id, lock=True)
        if plan.membership_id != ctx.membership.id:
            raise RoleForbiddenException()
        self._require_transition(plan.status, "submit")
        # The author must still be on the approving team when they submit.
        if not await self._is_team_member(plan.team_id, ctx.membership.id):
            raise RoleForbiddenException()
        main = await self._single_main(plan.id)
        if main is None:
            raise ValidationException(
                "A plan needs exactly one main task before it can be submitted"
            )
        if not main.why or not main.why.strip():
            raise ValidationException(
                "The main task needs a 'why' before the plan can be submitted"
            )
        if plan.week_start < current_week_start(today):
            raise ValidationException("Cannot submit a plan for a past week")
        plan.status = "submitted"
        plan.submitted_at = datetime.now(UTC)
        self._record_event(plan, ctx, "submitted")
        await self.session.flush()
        return plan

    async def withdraw(self, *, ctx: OrgContext, plan_id: uuid.UUID) -> Plan:
        """``submitted`` → ``draft`` (author only)."""
        plan = await self.get_readable_plan(ctx=ctx, plan_id=plan_id, lock=True)
        if plan.membership_id != ctx.membership.id:
            raise RoleForbiddenException()
        self._require_transition(plan.status, "withdraw")
        plan.status = "draft"
        plan.submitted_at = None
        self._record_event(plan, ctx, "withdrawn")
        await self.session.flush()
        return plan

    async def approve(self, *, ctx: OrgContext, plan_id: uuid.UUID) -> Plan:
        """``submitted`` → ``approved`` (eligible approver, self-approval rules)."""
        plan = await self.get_readable_plan(ctx=ctx, plan_id=plan_id, lock=True)
        self_approved = await self._authorize_decision(ctx=ctx, plan=plan)
        self._require_transition(plan.status, "approve")
        plan.status = "approved"
        plan.decided_at = datetime.now(UTC)
        plan.decided_by_membership_id = ctx.membership.id
        plan.decision_comment = None
        self._record_event(plan, ctx, "approved", self_approved=self_approved)
        await self.session.flush()
        return plan

    async def send_back(
        self, *, ctx: OrgContext, plan_id: uuid.UUID, comment: str
    ) -> Plan:
        """``submitted`` → ``draft`` with a required comment (eligible approver)."""
        plan = await self.get_readable_plan(ctx=ctx, plan_id=plan_id, lock=True)
        self_approved = await self._authorize_decision(ctx=ctx, plan=plan)
        self._require_transition(plan.status, "send_back")
        if not comment or not comment.strip():
            raise ValidationException("A comment is required when sending a plan back")
        plan.status = "draft"
        plan.decided_at = datetime.now(UTC)
        plan.decided_by_membership_id = ctx.membership.id
        plan.decision_comment = comment
        self._record_event(
            plan, ctx, "sent_back", comment=comment, self_approved=self_approved
        )
        await self.session.flush()
        return plan

    async def close(
        self, *, ctx: OrgContext, plan_id: uuid.UUID, shipped: bool
    ) -> Plan:
        """``approved`` → ``done`` recording whether it shipped (author only)."""
        plan = await self.get_readable_plan(ctx=ctx, plan_id=plan_id, lock=True)
        if plan.membership_id != ctx.membership.id:
            raise RoleForbiddenException()
        self._require_transition(plan.status, "close")
        plan.status = "done"
        plan.shipped = shipped
        plan.closed_at = datetime.now(UTC)
        self._record_event(plan, ctx, "closed")
        await self.session.flush()
        return plan

    # --- internals ------------------------------------------------------

    async def _authorize_decision(self, *, ctx: OrgContext, plan: Plan) -> bool:
        """Check the caller may approve/send back; return ``self_approved``.

        Eligible approvers are the lead of ``plan.team_id`` plus every org
        owner/admin. A non-author eligible approver is always allowed. The
        author may only act as their own approver when **no other** eligible
        approver exists; that case is recorded as ``self_approved``. A plain
        member who is the author is never eligible → ``403``.
        """
        eligible = await self._eligible_approvers(ctx.org.id, plan)
        if ctx.membership.id not in eligible:
            raise RoleForbiddenException()
        is_author = ctx.membership.id == plan.membership_id
        if is_author and (eligible - {ctx.membership.id}):
            raise RoleForbiddenException()
        return is_author

    async def _eligible_approvers(
        self, org_id: uuid.UUID, plan: Plan
    ) -> set[uuid.UUID]:
        ids: set[uuid.UUID] = set()
        lead = await self.session.scalar(
            select(Team.lead_membership_id).where(Team.id == plan.team_id)
        )
        if lead is not None:
            ids.add(lead)
        rows = await self.session.execute(
            select(Membership.id).where(
                Membership.org_id == org_id,
                Membership.role.in_(("owner", "admin")),
            )
        )
        ids.update(row[0] for row in rows.all())
        return ids

    async def _single_main(self, plan_id: uuid.UUID) -> Task | None:
        result = await self.session.execute(
            select(Task).where(Task.plan_id == plan_id, Task.kind == "main")
        )
        mains = result.scalars().all()
        return mains[0] if len(mains) == 1 else None

    async def _team_for_author(self, *, ctx: OrgContext, team_id: uuid.UUID) -> Team:
        """Resolve a team the caller may use as their approving team.

        Read-then-act: an admin/owner can *read* any team, so using a team they
        are not on is ``403 forbidden``; a plain member who is not on the team
        cannot read it, so they get ``404 not_found``. Only a team the caller
        belongs to is accepted (invariant: the author belongs to ``team_id``).
        """
        team = await get_in_org(self.session, Team, team_id, ctx.org.id)
        if await self._is_team_member(team.id, ctx.membership.id):
            return team
        if ctx.role in _ADMIN_ROLES:
            raise RoleForbiddenException()
        raise ResourceNotFoundException("Team not found")

    def _require_transition(self, status: str, action: str) -> None:
        if transition_target(status, action) is None:
            raise InvalidTransitionException()

    def _validate_week_start(self, week_start: date, today: date) -> None:
        if week_start.weekday() != 0:
            raise ValidationException("week_start must be a Monday")
        if week_start < current_week_start(today):
            raise ValidationException("Cannot create a plan for a past week")
        if week_start > latest_week_start(today):
            raise ValidationException("Cannot create a plan more than 4 weeks ahead")

    def _validate_task_counts(self, tasks_in: list[TaskInput]) -> None:
        mains = sum(1 for task in tasks_in if task.kind == "main")
        subs = sum(1 for task in tasks_in if task.kind == "sub_goal")
        gtms = sum(1 for task in tasks_in if task.kind == "gtm")
        if mains > 1:
            raise ValidationException("A plan can have at most one main task")
        if subs > _MAX_SUB_GOALS:
            raise ValidationException("A plan can have at most 5 sub-goals")
        if gtms > _MAX_GTM_GOALS:
            raise ValidationException("A plan can have at most 5 GTM goals")

    @staticmethod
    def _position(task_in: TaskInput, index: int) -> int:
        return task_in.position if task_in.position is not None else index

    def _new_task(self, plan: Plan, task_in: TaskInput, index: int) -> Task:
        return Task(
            org_id=plan.org_id,
            plan_id=plan.id,
            kind=task_in.kind,
            title=task_in.title,
            why=task_in.why,
            position=self._position(task_in, index),
        )

    def _record_event(
        self,
        plan: Plan,
        ctx: OrgContext,
        action: str,
        *,
        comment: str | None = None,
        self_approved: bool = False,
    ) -> None:
        self.session.add(
            PlanEvent(
                org_id=plan.org_id,
                plan_id=plan.id,
                actor_membership_id=ctx.membership.id,
                action=action,
                comment=comment,
                self_approved=self_approved,
            )
        )

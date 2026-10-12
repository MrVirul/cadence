"""Plans & tasks routes (docs/API.md §"Plans & tasks").

Thin layer over :class:`app.services.plans.PlanService`: it maps ORM rows to
response schemas and commits once per request. Access (read-then-act) and the
state machine live in the service.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any, cast

from fastapi import APIRouter, Query, status

from app.api.app.org_access import Today, require_org_member
from app.api.app.schemas import (
    MemberUser,
    PlanCloseRequest,
    PlanCreateRequest,
    PlanDetailResponse,
    PlanEventAction,
    PlanEventResponse,
    PlanListItem,
    PlanPerson,
    PlanStatus,
    PlanTaskResponse,
    PlanUpdateRequest,
    SendBackRequest,
    TaskKind,
    TaskStatus,
    TaskStatusRequest,
)
from app.database import DBSession
from app.models import Membership, Plan, PlanEvent, Task, User
from app.schemas import PageResponse
from app.services.plans import PlanService

router = APIRouter()


def _person(membership: Membership, user: User) -> PlanPerson:
    return PlanPerson(
        membership_id=membership.id,
        user=MemberUser(
            id=user.id,
            name=f"{user.first_name} {user.last_name}".strip(),
            email=user.email,
        ),
    )


def _task_response(task: Task) -> PlanTaskResponse:
    return PlanTaskResponse(
        id=task.id,
        kind=cast(TaskKind, task.kind),
        title=task.title,
        why=task.why,
        status=cast(TaskStatus, task.status),
        position=task.position,
        done_at=task.done_at,
    )


def _event_response(event: PlanEvent) -> PlanEventResponse:
    return PlanEventResponse(
        id=event.id,
        actor_membership_id=event.actor_membership_id,
        action=cast(PlanEventAction, event.action),
        comment=event.comment,
        self_approved=event.self_approved,
        created_at=event.created_at,
    )


async def _plan_fields(service: PlanService, plan: Plan) -> dict[str, Any]:
    author_membership, author_user = await service.person(plan.membership_id)
    decided_by = None
    if plan.decided_by_membership_id is not None:
        membership, user = await service.person(plan.decided_by_membership_id)
        decided_by = _person(membership, user)
    return {
        "id": plan.id,
        "week_start": plan.week_start,
        "status": plan.status,
        "team_id": plan.team_id,
        "author": _person(author_membership, author_user),
        "submitted_at": plan.submitted_at,
        "decided_at": plan.decided_at,
        "decided_by": decided_by,
        "decision_comment": plan.decision_comment,
        "shipped": plan.shipped,
        "closed_at": plan.closed_at,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }


async def _plan_detail(service: PlanService, plan: Plan) -> PlanDetailResponse:
    fields = await _plan_fields(service, plan)
    return PlanDetailResponse(
        **fields,
        tasks=[_task_response(task) for task in await service.list_tasks(plan.id)],
        events=[_event_response(event) for event in await service.list_events(plan.id)],
    )


@router.get("/orgs/{org_id}/plans", tags=["plans"])
async def list_plans(
    ctx: require_org_member,
    session: DBSession,
    week: Annotated[date | None, Query(description="Filter to one Monday")] = None,
    mine: bool = Query(default=False, description="Only the caller's own plans"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PageResponse[PlanListItem]:
    rows, total = await PlanService(session).list_plans(
        ctx=ctx, week=week, mine=mine, limit=limit, offset=offset
    )
    return PageResponse(
        items=[
            PlanListItem(
                id=plan.id,
                week_start=plan.week_start,
                status=cast(PlanStatus, plan.status),
                team_id=plan.team_id,
                author=_person(membership, user),
                tasks_done=done,
                tasks_total=total_tasks,
                shipped=plan.shipped,
                submitted_at=plan.submitted_at,
                decided_at=plan.decided_at,
                created_at=plan.created_at,
                updated_at=plan.updated_at,
            )
            for plan, membership, user, done, total_tasks in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/orgs/{org_id}/plans",
    status_code=status.HTTP_201_CREATED,
    tags=["plans"],
)
async def create_plan(
    data: PlanCreateRequest,
    ctx: require_org_member,
    today: Today,
    session: DBSession,
) -> PlanDetailResponse:
    service = PlanService(session)
    plan = await service.create(
        ctx=ctx,
        today=today,
        week_start=data.week_start,
        team_id=data.team_id,
        tasks_in=list(data.tasks),
    )
    await session.commit()
    return await _plan_detail(service, plan)


@router.get("/orgs/{org_id}/plans/{plan_id}", tags=["plans"])
async def get_plan(
    plan_id: uuid.UUID,
    ctx: require_org_member,
    session: DBSession,
) -> PlanDetailResponse:
    service = PlanService(session)
    plan, _, _ = await service.get_detail(ctx=ctx, plan_id=plan_id)
    return await _plan_detail(service, plan)


@router.put("/orgs/{org_id}/plans/{plan_id}", tags=["plans"])
async def update_plan(
    plan_id: uuid.UUID,
    data: PlanUpdateRequest,
    ctx: require_org_member,
    session: DBSession,
) -> PlanDetailResponse:
    service = PlanService(session)
    plan = await service.replace_content(
        ctx=ctx, plan_id=plan_id, team_id=data.team_id, tasks_in=list(data.tasks)
    )
    await session.commit()
    return await _plan_detail(service, plan)


@router.patch("/orgs/{org_id}/tasks/{task_id}", tags=["tasks"])
async def tick_task(
    task_id: uuid.UUID,
    data: TaskStatusRequest,
    ctx: require_org_member,
    session: DBSession,
) -> PlanTaskResponse:
    task = await PlanService(session).tick_task(
        ctx=ctx, task_id=task_id, status=data.status
    )
    await session.commit()
    return _task_response(task)


@router.post("/orgs/{org_id}/plans/{plan_id}/submit", tags=["plans"])
async def submit_plan(
    plan_id: uuid.UUID,
    ctx: require_org_member,
    today: Today,
    session: DBSession,
) -> PlanDetailResponse:
    service = PlanService(session)
    plan = await service.submit(ctx=ctx, plan_id=plan_id, today=today)
    await session.commit()
    return await _plan_detail(service, plan)


@router.post("/orgs/{org_id}/plans/{plan_id}/withdraw", tags=["plans"])
async def withdraw_plan(
    plan_id: uuid.UUID,
    ctx: require_org_member,
    session: DBSession,
) -> PlanDetailResponse:
    service = PlanService(session)
    plan = await service.withdraw(ctx=ctx, plan_id=plan_id)
    await session.commit()
    return await _plan_detail(service, plan)


@router.post("/orgs/{org_id}/plans/{plan_id}/approve", tags=["plans"])
async def approve_plan(
    plan_id: uuid.UUID,
    ctx: require_org_member,
    session: DBSession,
) -> PlanDetailResponse:
    service = PlanService(session)
    plan = await service.approve(ctx=ctx, plan_id=plan_id)
    await session.commit()
    return await _plan_detail(service, plan)


@router.post("/orgs/{org_id}/plans/{plan_id}/send-back", tags=["plans"])
async def send_back_plan(
    plan_id: uuid.UUID,
    data: SendBackRequest,
    ctx: require_org_member,
    session: DBSession,
) -> PlanDetailResponse:
    service = PlanService(session)
    plan = await service.send_back(ctx=ctx, plan_id=plan_id, comment=data.comment)
    await session.commit()
    return await _plan_detail(service, plan)


@router.post("/orgs/{org_id}/plans/{plan_id}/close", tags=["plans"])
async def close_plan(
    plan_id: uuid.UUID,
    data: PlanCloseRequest,
    ctx: require_org_member,
    session: DBSession,
) -> PlanDetailResponse:
    service = PlanService(session)
    plan = await service.close(ctx=ctx, plan_id=plan_id, shipped=data.shipped)
    await session.commit()
    return await _plan_detail(service, plan)

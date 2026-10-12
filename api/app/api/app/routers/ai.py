"""AI routes (docs/API.md §"AI"). Stateless: never write plans or tasks.

Both endpoints accept the caller's *live form state* (there is no DB id, no
IDOR surface), run through :func:`run_ai_call` (limits, ``ai_calls`` telemetry,
failure mapping) and return the validated structured output as-is.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.ai.agents import ReviewDeps, build_draft_agent, build_review_agent
from app.ai.prompts import serialize_plan, wrap_notes
from app.ai.runner import run_ai_call
from app.ai.schemas import DraftRequest, PlanDraft, PlanReview, ReviewRequest, TaskIn
from app.api.app.org_access import require_org_member

router = APIRouter()


def _review_deps(tasks: list[TaskIn]) -> ReviewDeps:
    return ReviewDeps(
        refs=frozenset(task.ref for task in tasks),
        main_refs=frozenset(task.ref for task in tasks if task.kind == "main"),
        titles={task.ref: task.title for task in tasks},
        whys={task.ref: task.why for task in tasks},
    )


@router.post("/orgs/{org_id}/ai/plan-review", tags=["ai"])
async def plan_review(
    data: ReviewRequest,
    ctx: require_org_member,
) -> PlanReview:
    """Review the caller's current plan form state (no DB id)."""

    async def run():
        agent = build_review_agent()
        return await agent.run(
            serialize_plan(data.week_start, list(data.tasks)),
            deps=_review_deps(list(data.tasks)),
        )

    return await run_ai_call(feature="plan_review", ctx=ctx, call=run)


@router.post("/orgs/{org_id}/ai/plan-draft", tags=["ai"])
async def plan_draft(
    data: DraftRequest,
    ctx: require_org_member,
) -> PlanDraft:
    """Draft a plan from a brain dump; never writes to the database."""

    async def run():
        agent = build_draft_agent()
        return await agent.run(wrap_notes(data.notes))

    return await run_ai_call(feature="plan_draft", ctx=ctx, call=run)

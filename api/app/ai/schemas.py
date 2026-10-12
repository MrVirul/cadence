"""AI feature schemas (root AGENTS.md §7, docs/API.md §"AI").

These models play a double role:

- **Requests** (`ReviewRequest`, `DraftRequest`): FastAPI body schemas. They use
  ``extra="forbid"`` like every request schema, so a client can never smuggle in
  a server-controlled field. Length limits mirror the task limits in the data
  model (title ≤ 200, why ≤ 500) plus the AI-specific ones (1–12 tasks, notes
  ≤ 4000).
- **Outputs** (`Finding`, `PlanReview`, `DraftTask`, `PlanDraft`): Pydantic AI
  ``output_type`` schemas **and** FastAPI response models, so the orval client
  gets real types and the model's structured output is validated against the
  same shape the API advertises.

No ORM ids, no org/membership references: the AI endpoints are stateless — the
review takes the caller's live form state, the draft never touches the DB.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import ConfigDict, Field

from app.schemas import Model

ReviewTaskKind = Literal["main", "sub_goal", "gtm"]
FindingCategory = Literal[
    "not_verifiable",
    "missing_why",
    "missing_gtm",
    "scope_too_big",
    "too_vague",
    "duplicate",
]
FindingSeverity = Literal["blocker", "suggestion"]
FindingAction = Literal["rewrite_title", "rewrite_why", "add_task"]


class AIRequest(Model):
    """Request schemas reject unknown fields (the schema-layer tenancy guard)."""

    model_config = ConfigDict(extra="forbid")


class TaskIn(AIRequest):
    """One task as the member currently has it in the form (not a DB id)."""

    ref: str = Field(min_length=1, max_length=64)
    kind: ReviewTaskKind
    title: str = Field(min_length=1, max_length=200)
    why: str | None = Field(default=None, max_length=500)


class ReviewRequest(AIRequest):
    week_start: date
    tasks: list[TaskIn] = Field(min_length=1, max_length=12)


class Finding(Model):
    """One finding; ``task_ref`` is the submitted task it points at (``None``
    only for plan-level findings, e.g. a missing GTM goal)."""

    task_ref: str | None = None
    category: FindingCategory
    severity: FindingSeverity
    problem: str
    action: FindingAction
    suggested_rewrite: str
    suggested_kind: Literal["sub_goal", "gtm"] | None = None


class PlanReview(Model):
    verdict: Literal["approve", "adjust"]
    summary: str
    findings: list[Finding] = Field(default_factory=list)


class DraftTask(Model):
    """A draft task: a checkable result, not "work to do"."""

    title: str = Field(min_length=1, max_length=200)
    why: str | None = Field(default=None, max_length=500)


class PlanDraft(Model):
    main: DraftTask
    sub_goals: list[DraftTask] = Field(default_factory=list, max_length=5)
    gtm_goals: list[DraftTask] = Field(default_factory=list, max_length=5)
    left_out: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)


class DraftRequest(AIRequest):
    notes: str = Field(min_length=1, max_length=4000)
    week_start: date

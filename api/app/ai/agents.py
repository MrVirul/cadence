"""Lazy agent builders for the two AI features (root AGENTS.md §7).

Agents are built once (``lru_cache``) and *never* resolved against Google at
import time: with no ``GOOGLE_API_KEY`` configured the model is kept as an
unresolved model string with ``defer_model_check=True``, so importing the app
and running the test suite needs no key. ``run_ai_call`` in :mod:`app.ai.runner`
checks the key *before* the agent is ever asked to run, so the disabled state
never constructs a provider.

The review agent validates its structured output through an ``@output_validator``
that raises :class:`ModelRetry` (agent ``retries=2``) for output that could not
be applied to the plan, or that contradicts itself (an "approve" verdict with a
blocker finding).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

from pydantic_ai import Agent, ModelRetry
from pydantic_ai.models import Model
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.tools import RunContext

from app.ai.prompts import DRAFT_INSTRUCTIONS, REVIEW_INSTRUCTIONS
from app.ai.schemas import PlanDraft, PlanReview
from app.config import settings


@dataclass(frozen=True)
class ReviewDeps:
    """Per-run validation context for the review agent.

    Carries every submitted ref, the refs of main tasks, and the original task
    texts, so the output validator can reject findings the UI could not apply.
    """

    refs: frozenset[str]
    main_refs: frozenset[str]
    # Whether the submitted plan already carries at least one go-to-market task.
    # The rubric makes a GTM goal mandatory, so the validator backstops the
    # prompt when the model forgets to flag its absence (see ``has_gtm`` below).
    has_gtm: bool
    titles: dict[str, str] = field(default_factory=dict)
    whys: dict[str, str | None] = field(default_factory=dict)


def _default_model() -> Model | str:
    """A Google Gemini model, or an unresolved string when no key is set.

    The key is only ever read here, server-side; it is never returned by an
    endpoint and never logged.
    """
    if settings.GOOGLE_API_KEY:
        return GoogleModel(
            settings.AI_MODEL, provider=GoogleProvider(api_key=settings.GOOGLE_API_KEY)
        )
    return f"google-gla:{settings.AI_MODEL}"


@lru_cache(maxsize=1)
def build_review_agent() -> Agent[ReviewDeps, PlanReview]:
    """The plan-review agent (one per process; tests override its model)."""
    agent = Agent(
        _default_model(),
        output_type=PlanReview,
        deps_type=ReviewDeps,
        retries=2,
        defer_model_check=True,
        instructions=REVIEW_INSTRUCTIONS,
    )

    @agent.output_validator
    def _validate_review(ctx: RunContext[ReviewDeps], output: PlanReview) -> PlanReview:
        """Reject review output the UI could not apply (raises ModelRetry).

        The agent gets ``retries=2``, so an invalid answer triggers a fresh
        model turn instead of reaching the API response.
        """
        if len(output.findings) > 8:
            raise ModelRetry(
                f"Too many findings ({len(output.findings)}); keep at most 8, "
                "preferring the most important ones."
            )
        if output.verdict == "approve" and any(
            f.severity == "blocker" for f in output.findings
        ):
            raise ModelRetry(
                "verdict is 'approve' but a blocker finding exists; change the "
                "verdict to 'adjust' or downgrade/remove the blocker."
            )

        # Deterministic go-to-market backstop. The rubric makes a GTM goal
        # mandatory, but a model occasionally approves a plan that has none; the
        # validator cannot invent the missing finding (the prompt owns the
        # wording), so it rejects the answer and lets the retry fix it. A
        # ``suggestion``-severity ``missing_gtm`` finding is enough to satisfy it.
        if not ctx.deps.has_gtm:
            has_missing_gtm = any(
                finding.category == "missing_gtm" for finding in output.findings
            )
            if not has_missing_gtm:
                raise ModelRetry(
                    "the plan has no go-to-market goal; add a finding with "
                    "category='missing_gtm', action='add_task' and "
                    "suggested_kind='gtm'."
                )
            if output.verdict == "approve":
                raise ModelRetry(
                    "the plan has no go-to-market goal, so the verdict cannot be "
                    "'approve'; set verdict to 'adjust'."
                )

        for finding in output.findings:
            ref = finding.task_ref
            if finding.action == "add_task" and finding.suggested_kind is None:
                raise ModelRetry(
                    "an add_task finding must include suggested_kind "
                    "('sub_goal' or 'gtm')"
                )
            if ref is None:
                continue
            if ref not in ctx.deps.refs:
                raise ModelRetry(
                    f"task_ref '{ref}' is not one of the submitted refs "
                    f"{sorted(ctx.deps.refs)}"
                )
            if finding.action == "rewrite_why" and ref not in ctx.deps.main_refs:
                raise ModelRetry(
                    f"rewrite_why targets '{ref}', which is not the main task; "
                    "why-rewrites apply only to the main task"
                )
            original = (
                ctx.deps.titles.get(ref)
                if finding.action == "rewrite_title"
                else ctx.deps.whys.get(ref)
            )
            if not finding.suggested_rewrite.strip():
                raise ModelRetry("suggested_rewrite must not be empty")
            if (
                original is not None
                and finding.suggested_rewrite.strip() == original.strip()
            ):
                raise ModelRetry(
                    f"suggested_rewrite for '{ref}' is identical to the original "
                    "text; give the author a concrete replacement"
                )
        return output

    return agent


@lru_cache(maxsize=1)
def build_draft_agent() -> Agent[None, PlanDraft]:
    """The draft-from-notes agent (one per process; tests override its model)."""
    return Agent(
        _default_model(),
        output_type=PlanDraft,
        deps_type=type(None),
        retries=2,
        defer_model_check=True,
        instructions=DRAFT_INSTRUCTIONS,
    )

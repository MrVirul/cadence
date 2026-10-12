"""AI call wrapper: one place for limits, recording and failure mapping.

Every AI endpoint goes through :func:`run_ai_call`. On **every** outcome — a
no-key disabled state, a local limit, an upstream 429, a timeout, invalid
output, an unexpected error, or success — the outcome's ``ai_calls`` row is
committed in its **own short session** *before* any HTTP error is raised. The
request's own session may roll back, so the telemetry must not ride in it; the
row is written in a separate transaction so it survives.

The row never contains plan text, prompt text or output text — only metadata
(staff privacy decision, docs/DECISIONS.md).
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import TypeVar

from pydantic_ai import ModelHTTPError, UnexpectedModelBehavior
from pydantic_ai.run import AgentRunResult

from app import database
from app.ai.limits import count_recent_org_calls, count_recent_user_calls
from app.api.app.org_access import OrgContext
from app.config import settings
from app.exceptions import (
    AiBadOutputException,
    AiErrorException,
    AiRateLimitedException,
    AiTimeoutException,
    AiUnavailableException,
)
from app.logging import logger
from app.models import AiCall

T = TypeVar("T")

_USER_RETRY_AFTER = 60  # per-minute window
_ORG_RETRY_AFTER = 3600  # per-day window


async def _record_ai_call(
    *,
    feature: str,
    ctx: OrgContext,
    status: str,
    error_class: str | None = None,
    model: str | None = None,
    latency_ms: int | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> None:
    """Commit one ``ai_calls`` row in its own short session.

    Called with a fresh session so the write is committed independently of the
    request transaction (the router would roll the request session back on a
    raised HTTP error). Metadata only — never plan/prompt/output text.
    """
    async with database.AsyncSessionLocal() as session:
        session.add(
            AiCall(
                org_id=ctx.org.id,
                membership_id=ctx.membership.id,
                feature=feature,
                model=model,
                status=status,
                error_class=error_class,
                latency_ms=latency_ms,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        )
        await session.commit()


async def run_ai_call[T](
    *,
    feature: str,
    ctx: OrgContext,
    call: Callable[[], Awaitable[AgentRunResult[T]]],
) -> T:
    """Run one AI call with limits, telemetry and failure mapping.

    ``call`` is a zero-argument coroutine factory, so the agent/model is built
    lazily *after* the no-key and local-limit checks (no provider is constructed
    for the disabled state). Returns the parsed, validated structured output on
    success; every failure raises the matching ``APIException`` *after* its
    ``ai_calls`` row is committed.
    """
    now = datetime.now(UTC)
    model = settings.AI_MODEL

    # (a) No key configured — the feature is disabled; planning still works.
    if not settings.GOOGLE_API_KEY:
        await _record_ai_call(feature=feature, ctx=ctx, status="disabled", model=None)
        raise AiUnavailableException()

    # (b) Local limits, counted from ai_calls rows (works across workers).
    async with database.AsyncSessionLocal() as session:
        user_calls = await count_recent_user_calls(session, ctx.membership.id, now=now)
        org_calls = await count_recent_org_calls(session, ctx.org.id, now=now)
    if user_calls >= settings.AI_LIMIT_PER_USER_PER_MINUTE:
        await _record_ai_call(
            feature=feature,
            ctx=ctx,
            status="rate_limited",
            error_class="local_limit",
            model=model,
        )
        raise AiRateLimitedException(_USER_RETRY_AFTER)
    if org_calls >= settings.AI_LIMIT_PER_ORG_PER_DAY:
        await _record_ai_call(
            feature=feature,
            ctx=ctx,
            status="rate_limited",
            error_class="local_limit",
            model=model,
        )
        raise AiRateLimitedException(_ORG_RETRY_AFTER)

    # (c-g) Run the model, mapping every failure to an HTTP error and a row.
    started = time.perf_counter()
    try:
        async with asyncio.timeout(settings.AI_TIMEOUT_SECONDS):
            result = await call()
    except TimeoutError:
        await _record_ai_call(
            feature=feature,
            ctx=ctx,
            status="timeout",
            model=model,
            latency_ms=_ms_since(started),
        )
        raise AiTimeoutException() from None
    except ModelHTTPError as exc:
        if exc.status_code == 429:
            status, error_class = "rate_limited", "upstream_429"
            await _record_ai_call(
                feature=feature,
                ctx=ctx,
                status=status,
                error_class=error_class,
                model=model,
                latency_ms=_ms_since(started),
            )
            raise AiRateLimitedException(_USER_RETRY_AFTER) from None
        # Any other upstream HTTP error is a plain AI failure.
        await _record_ai_call(
            feature=feature,
            ctx=ctx,
            status="error",
            model=model,
            latency_ms=_ms_since(started),
        )
        logger.error("AI upstream error status=%s", exc.status_code)
        raise AiErrorException() from None
    except UnexpectedModelBehavior:
        await _record_ai_call(
            feature=feature,
            ctx=ctx,
            status="error",
            error_class="bad_output",
            model=model,
            latency_ms=_ms_since(started),
        )
        raise AiBadOutputException() from None
    except Exception as exc:  # noqa: BLE001 — any provider failure maps to 502
        # Never leak the provider message, traceback or API key. Log ONLY the
        # feature, org id, status and the exception CLASS NAME — the message of
        # a provider error can echo the request (plan text) or the key.
        logger.error(
            "AI call failed feature=%s org_id=%s status=error error_class=%s",
            feature,
            ctx.org.id,
            type(exc).__name__,
        )
        await _record_ai_call(
            feature=feature,
            ctx=ctx,
            status="error",
            model=model,
            latency_ms=_ms_since(started),
        )
        raise AiErrorException() from None

    latency_ms = _ms_since(started)
    usage = result.usage
    await _record_ai_call(
        feature=feature,
        ctx=ctx,
        status="success",
        model=model,
        latency_ms=latency_ms,
        input_tokens=usage.input_tokens or None,
        output_tokens=usage.output_tokens or None,
    )
    return result.output


def _ms_since(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)

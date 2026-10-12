"""Internal AI-usage routes (docs/API.md §"/internal").

Metadata only: per-org call counts, failures, rate limits, latency and token
totals. No prompt, plan, task or model-output text is ever selected or returned
(root ``AGENTS.md`` §6 privacy call).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.internal.access import CurrentInternalUser
from app.api.internal.schemas import (
    AiUsageDailyResponse,
    AiUsageDay,
    AiUsageListResponse,
    AiUsageRow,
)
from app.clock import today_utc
from app.database import DBSession
from app.services.internal import (
    USAGE_DEFAULT_DAYS,
    InternalAiUsageService,
    validate_usage_range,
)

router = APIRouter()


def _default_window(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    """Apply the default (last ``USAGE_DEFAULT_DAYS`` days) and validate the range."""
    today = today_utc()
    start = date_from or today - timedelta(days=USAGE_DEFAULT_DAYS)
    end = date_to or today
    validate_usage_range(start, end)
    return start, end


@router.get("/ai-usage", tags=["ai-usage"])
async def ai_usage_list(
    current_user: CurrentInternalUser,
    session: DBSession,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> AiUsageListResponse:
    start, end = _default_window(date_from, date_to)
    items, total = await InternalAiUsageService(session).usage(
        date_from=start, date_to=end, limit=limit, offset=offset
    )
    return AiUsageListResponse(
        items=[AiUsageRow(**item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/ai-usage/{org_id}/daily", tags=["ai-usage"])
async def ai_usage_daily(
    current_user: CurrentInternalUser,
    session: DBSession,
    org_id: uuid.UUID,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> AiUsageDailyResponse:
    start, end = _default_window(date_from, date_to)
    days = await InternalAiUsageService(session).daily(
        org_id=org_id, date_from=start, date_to=end
    )
    return AiUsageDailyResponse(days=[AiUsageDay(**day) for day in days])

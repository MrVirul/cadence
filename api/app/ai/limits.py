"""Local rate-limit counters for the AI endpoints (root AGENTS.md §7).

Limits are counted from ``ai_calls`` rows in the database so they work across
workers. Rows with ``error_class='local_limit'`` or ``status='disabled'`` are
*not* counted: being limited (or the feature being off) must not extend the
lock window.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiCall

USER_WINDOW = timedelta(seconds=60)
ORG_WINDOW = timedelta(days=1)


def _countable() -> tuple:
    return (
        AiCall.status != "disabled",
        AiCall.error_class.is_distinct_from("local_limit"),
    )


async def count_recent_user_calls(
    session: AsyncSession, membership_id, *, now: datetime | None = None
) -> int:
    """AI calls by this member in the last 60 seconds (per-user-per-minute)."""
    since = (now or datetime.now(UTC)) - USER_WINDOW
    total = await session.scalar(
        select(func.count(AiCall.id)).where(
            AiCall.membership_id == membership_id,
            AiCall.created_at >= since,
            *_countable(),
        )
    )
    return int(total or 0)


async def count_recent_org_calls(
    session: AsyncSession, org_id, *, now: datetime | None = None
) -> int:
    """AI calls by this org in the last 24 hours (per-org-per-day)."""
    since = (now or datetime.now(UTC)) - ORG_WINDOW
    total = await session.scalar(
        select(func.count(AiCall.id)).where(
            AiCall.org_id == org_id,
            AiCall.created_at >= since,
            *_countable(),
        )
    )
    return int(total or 0)

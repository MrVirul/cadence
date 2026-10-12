"""Time helpers for the weekly cadence (docs/API.md §"Plans & tasks").

``today_utc`` is the single source of "now" for plan weeks. It is exposed to
routes as a FastAPI dependency (``app.api.app.org_access.get_today``) so tests
can pin the date and control which weeks are "current", "past" or too far
ahead. "Current week" is the Monday of today in UTC.
"""

from datetime import UTC, date, datetime, timedelta

# A plan may be created for the current week and up to this many weeks ahead.
MAX_WEEKS_AHEAD = 4


def today_utc() -> date:
    """Today's date in UTC. The one place the wall clock is read."""
    return datetime.now(UTC).date()


def current_week_start(today: date) -> date:
    """The Monday of the week that contains ``today``."""
    return today - timedelta(days=today.weekday())


def latest_week_start(today: date) -> date:
    """The furthest Monday a new plan may target (``today`` + 4 weeks)."""
    return current_week_start(today) + timedelta(weeks=MAX_WEEKS_AHEAD)

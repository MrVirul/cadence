"""Draft-from-notes endpoint: valid output, no DB writes, untrusted notes block.

Runs fully offline via the autouse ``stub_ai`` fixture (``tests/conftest.py``).
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.ai import agents
from app.models import Plan, Task
from tests.ai_support import (
    WEEK,
    ai_call_count,
    auth,
    draft_model,
    prompt_text,
    seed_org_with_member,
)

_NOTES = "Ship checkout by Friday. Add an analytics event and update the changelog."


def _body(notes: str = _NOTES) -> dict:
    return {"week_start": WEEK.isoformat(), "notes": notes}


async def _table_counts(session_factory) -> tuple[int, int]:
    async with session_factory() as db:
        plans = int(await db.scalar(select(func.count(Plan.id))) or 0)
        tasks = int(await db.scalar(select(func.count(Task.id))) or 0)
    return plans, tasks


async def test_draft_returns_plan_draft(async_client, session_factory):
    org, user, _membership = await seed_org_with_member(session_factory)

    resp = await async_client.post(
        f"/app/orgs/{org.id}/ai/plan-draft",
        headers=auth(user),
        json=_body(),
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data) == {
        "main",
        "sub_goals",
        "gtm_goals",
        "left_out",
        "open_questions",
    }
    assert data["main"]["title"]
    assert await ai_call_count(session_factory) == 1


async def test_draft_does_not_write_plans_or_tasks(async_client, session_factory):
    """The endpoint is stateless: plan/task counts are unchanged."""
    org, user, _membership = await seed_org_with_member(session_factory)
    plans_before, tasks_before = await _table_counts(session_factory)

    resp = await async_client.post(
        f"/app/orgs/{org.id}/ai/plan-draft",
        headers=auth(user),
        json=_body(),
    )

    assert resp.status_code == 200, resp.text
    plans_after, tasks_after = await _table_counts(session_factory)
    assert (plans_after, tasks_after) == (plans_before, tasks_before)


async def test_draft_prompt_wraps_notes_and_carries_no_identity(
    async_client, session_factory
):
    org, user, _membership = await seed_org_with_member(session_factory)
    captured: list = []

    with agents.build_draft_agent().override(model=draft_model(capture=captured)):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-draft",
            headers=auth(user),
            json=_body(),
        )

    assert resp.status_code == 200, resp.text
    prompt = prompt_text(captured[0])
    # The notes are wrapped as untrusted data. (The instructions also mention
    # the wrapper, so anchor on the notes body.)
    assert prompt.count("<notes>\\n") == 1
    assert "</notes>" in prompt
    assert _NOTES in prompt
    assert "untrusted" in prompt
    assert user.email not in prompt
    assert org.name not in prompt

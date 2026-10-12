"""AI failure modes, limits and privacy: every outcome writes one row.

Each test asserts the HTTP status, the error ``code`` in the body, and the
``ai_calls`` row (status, error_class, org_id, membership_id). No provider is
ever reached: models are deterministic ``FunctionModel``s and the key is fake.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from pydantic_ai import ModelHTTPError, UnexpectedModelBehavior
from pydantic_ai.messages import ModelResponse, ToolCallPart
from pydantic_ai.models.function import FunctionModel
from sqlalchemy import select

from app.ai import agents
from app.models import AiCall
from tests.ai_support import (
    WEEK,
    ai_call_count,
    ai_call_statuses,
    auth,
    latest_ai_call,
    output_tool_name,
    prompt_text,
    review_model,
    seed_org_with_member,
)


def _body(title: str = "Checkout handles expired cards") -> dict:
    return {
        "week_start": WEEK.isoformat(),
        "tasks": [
            {
                "ref": "t1",
                "kind": "main",
                "title": title,
                "why": "Users are blocked at payment",
            }
        ],
    }


def _never_called(*, calls: list):
    """A model that fails the test loudly if the route calls it."""

    def fn(messages, info):
        calls.append(1)
        raise AssertionError("the model must not be called")

    return FunctionModel(fn)


async def test_no_key_returns_503_disabled(async_client, session_factory, monkeypatch):
    from app import config

    monkeypatch.setattr(config.settings, "GOOGLE_API_KEY", "")
    org, user, membership = await seed_org_with_member(session_factory)
    calls: list[int] = []

    with agents.build_review_agent().override(model=_never_called(calls=calls)):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-review",
            headers=auth(user),
            json=_body(),
        )

    assert resp.status_code == 503, resp.text
    assert resp.json()["code"] == "ai_unavailable"
    assert calls == []

    assert await ai_call_count(session_factory) == 1
    row = await latest_ai_call(session_factory)
    assert (row.status, row.error_class) == ("disabled", None)
    assert row.org_id == org.id
    assert row.membership_id == membership.id


async def test_upstream_429_returns_429(async_client, session_factory):
    org, user, membership = await seed_org_with_member(session_factory)

    def fn(messages, info):
        raise ModelHTTPError(429, "gemini")

    with agents.build_review_agent().override(model=FunctionModel(fn)):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-review",
            headers=auth(user),
            json=_body(),
        )

    assert resp.status_code == 429, resp.text
    assert resp.json()["code"] == "ai_rate_limited"
    assert resp.headers["retry-after"] == "60"

    row = await latest_ai_call(session_factory)
    assert (row.status, row.error_class) == ("rate_limited", "upstream_429")
    assert row.org_id == org.id
    assert row.membership_id == membership.id


async def test_timeout_returns_504(async_client, session_factory, monkeypatch):
    monkeypatch.setattr("app.config.settings.AI_TIMEOUT_SECONDS", 0.2)
    org, user, membership = await seed_org_with_member(session_factory)

    async def slow_fn(messages, info):
        await asyncio.sleep(1)
        return ModelResponse(
            parts=[
                ToolCallPart(
                    output_tool_name(info),
                    {"verdict": "approve", "summary": "late", "findings": []},
                )
            ]
        )

    with agents.build_review_agent().override(model=FunctionModel(slow_fn)):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-review",
            headers=auth(user),
            json=_body(),
        )

    assert resp.status_code == 504, resp.text
    assert resp.json()["code"] == "ai_timeout"

    row = await latest_ai_call(session_factory)
    assert (row.status, row.error_class) == ("timeout", None)
    assert row.org_id == org.id
    assert row.membership_id == membership.id


async def test_bad_output_after_retries_returns_502(async_client, session_factory):
    org, user, membership = await seed_org_with_member(session_factory)

    def fn(messages, info):
        raise UnexpectedModelBehavior("output failed validation")

    with agents.build_review_agent().override(model=FunctionModel(fn)):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-review",
            headers=auth(user),
            json=_body(),
        )

    assert resp.status_code == 502, resp.text
    assert resp.json()["code"] == "ai_bad_output"

    row = await latest_ai_call(session_factory)
    assert (row.status, row.error_class) == ("error", "bad_output")
    assert row.org_id == org.id
    assert row.membership_id == membership.id


async def test_generic_exception_returns_502_and_hides_message(
    async_client, session_factory
):
    org, user, membership = await seed_org_with_member(session_factory)
    secret = "boom secret provider detail"

    def fn(messages, info):
        raise RuntimeError(secret)

    with agents.build_review_agent().override(model=FunctionModel(fn)):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-review",
            headers=auth(user),
            json=_body(),
        )

    assert resp.status_code == 502, resp.text
    assert resp.json()["code"] == "ai_error"
    assert secret not in resp.text

    row = await latest_ai_call(session_factory)
    assert (row.status, row.error_class) == ("error", None)
    assert row.org_id == org.id
    assert row.membership_id == membership.id


async def test_api_key_never_leaks_in_response_or_logs(
    async_client, session_factory, monkeypatch, caplog
):
    from app import config

    secret = f"sk-cadence-{uuid.uuid4().hex}"
    monkeypatch.setattr(config.settings, "GOOGLE_API_KEY", secret)
    org, user, membership = await seed_org_with_member(session_factory)

    def fn(messages, info):
        raise RuntimeError(f"provider call failed using key {secret}")

    with (
        agents.build_review_agent().override(model=FunctionModel(fn)),
        caplog.at_level(logging.ERROR),
    ):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-review",
            headers=auth(user),
            json=_body(),
        )

    assert resp.status_code == 502, resp.text
    assert resp.json()["code"] == "ai_error"
    assert secret not in resp.text
    assert "provider call failed" not in resp.text

    # The runner logs only the feature/org/status/class name, never the message
    # or traceback, so the key and the provider text stay out of the logs.
    assert secret not in caplog.text
    assert "provider call failed" not in caplog.text
    assert "RuntimeError" in caplog.text

    row = await latest_ai_call(session_factory)
    assert row.status == "error"
    assert row.org_id == org.id
    assert row.membership_id == membership.id


async def test_cross_org_returns_404_and_writes_no_row(async_client, session_factory):
    org_a, _user_a, _membership_a = await seed_org_with_member(session_factory)
    org_b, user_b, _membership_b = await seed_org_with_member(session_factory)
    calls: list[int] = []

    with agents.build_review_agent().override(model=_never_called(calls=calls)):
        resp = await async_client.post(
            f"/app/orgs/{org_a.id}/ai/plan-review",
            headers=auth(user_b),
            json=_body(),
        )

    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "not_found"
    assert calls == []
    assert await ai_call_count(session_factory, org_id=org_a.id) == 0
    assert await ai_call_count(session_factory, org_id=org_b.id) == 0


async def test_suspended_org_returns_403_with_zero_model_calls(
    async_client, session_factory
):
    org, user, _membership = await seed_org_with_member(session_factory, suspended=True)
    calls: list[int] = []

    with agents.build_review_agent().override(model=_never_called(calls=calls)):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-review",
            headers=auth(user),
            json=_body(),
        )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "org_suspended"
    assert calls == []
    assert await ai_call_count(session_factory) == 0


async def test_local_per_minute_limit_trips_and_limited_rows_do_not_count(
    async_client, session_factory, monkeypatch
):
    from app import config

    monkeypatch.setattr(config.settings, "AI_LIMIT_PER_USER_PER_MINUTE", 2)
    org, user, membership = await seed_org_with_member(session_factory)
    url = f"/app/orgs/{org.id}/ai/plan-review"

    for _ in range(2):
        ok = await async_client.post(url, headers=auth(user), json=_body())
        assert ok.status_code == 200, ok.text

    limited = await async_client.post(url, headers=auth(user), json=_body())
    assert limited.status_code == 429, limited.text
    assert limited.json()["code"] == "ai_rate_limited"
    assert limited.headers["retry-after"] == "60"

    statuses = await ai_call_statuses(session_factory)
    assert statuses.count(("success", None)) == 2
    assert statuses.count(("rate_limited", "local_limit")) == 1

    # A limited row must not count toward the window: with room for 3, the next
    # call sees only the 2 successful rows and succeeds.
    monkeypatch.setattr(config.settings, "AI_LIMIT_PER_USER_PER_MINUTE", 3)
    after = await async_client.post(url, headers=auth(user), json=_body())
    assert after.status_code == 200, after.text

    statuses = await ai_call_statuses(session_factory)
    assert statuses.count(("success", None)) == 3
    assert statuses.count(("rate_limited", "local_limit")) == 1
    assert membership.id is not None


async def test_per_org_daily_limit_trips(async_client, session_factory, monkeypatch):
    from app import config

    monkeypatch.setattr(config.settings, "AI_LIMIT_PER_ORG_PER_DAY", 2)
    # Keep the per-user window out of the way so the org cap is what trips.
    monkeypatch.setattr(config.settings, "AI_LIMIT_PER_USER_PER_MINUTE", 100)
    org, user, membership = await seed_org_with_member(session_factory)
    url = f"/app/orgs/{org.id}/ai/plan-review"

    for _ in range(2):
        ok = await async_client.post(url, headers=auth(user), json=_body())
        assert ok.status_code == 200, ok.text

    limited = await async_client.post(url, headers=auth(user), json=_body())
    assert limited.status_code == 429, limited.text
    assert limited.json()["code"] == "ai_rate_limited"
    assert limited.headers["retry-after"] == "3600"

    statuses = await ai_call_statuses(session_factory)
    assert statuses.count(("success", None)) == 2
    assert statuses.count(("rate_limited", "local_limit")) == 1
    assert membership.id is not None


async def test_ai_calls_row_never_stores_plan_prompt_or_output_text(
    async_client, session_factory
):
    org, user, membership = await seed_org_with_member(session_factory)
    marker = f"UNIQUE-PLAN-MARKER-{uuid.uuid4().hex}"
    captured: list = []
    body = _body(title=f"Ship {marker}")

    with agents.build_review_agent().override(model=review_model(capture=captured)):
        resp = await async_client.post(
            f"/app/orgs/{org.id}/ai/plan-review",
            headers=auth(user),
            json=body,
        )

    assert resp.status_code == 200, resp.text
    # The plan text reached the model...
    assert marker in prompt_text(captured[0])

    # ...but nothing plan/prompt/output-like is persisted. Inspect every
    # text-like column of the success row.
    async with session_factory() as db:
        row = (await db.execute(select(AiCall))).scalar_one()
    assert row.status == "success"
    assert row.org_id == org.id
    assert row.membership_id == membership.id
    for column in AiCall.__table__.columns:
        value = getattr(row, column.name)
        assert marker not in str(value), f"plan text leaked into {column.name}"
    assert "Looks shippable" not in repr(row.__dict__)

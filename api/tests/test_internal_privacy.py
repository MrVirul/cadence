"""Privacy tests for the ``/internal`` surface (root ``AGENTS.md`` §6).

Platform staff see metadata and counts — never the text of plans, tasks, review
comments or AI prompts/outputs. Every ``/internal`` endpoint is called against a
world seeded with a unique marker string in plans, tasks and plan events, and
every response is checked for:

1. absence of the marker string anywhere in the serialized JSON body; and
2. absence of any JSON key in ``{"title", "why", "notes", "prompt", "text"}``.
"""

from __future__ import annotations

from typing import Any

import pytest

from tests.internal_registry import (
    INTERNAL_REGISTRY,
    InternalRouteCase,
    InternalWorld,
    build_internal_world,
)

FORBIDDEN_INTERNAL_KEYS: frozenset[str] = frozenset(
    {"title", "why", "notes", "prompt", "text"}
)


def _auth(token: str) -> dict[str, str]:
    return {"Access-Token": f"Bearer {token}"}


def _url(case: InternalRouteCase, world: InternalWorld) -> str:
    return case.path.format(**case.ids_for_world(world))


def _collect_keys(payload: Any) -> set[str]:
    """Recursively collect every dict key in a parsed JSON value."""
    found: set[str] = set()
    if isinstance(payload, dict):
        for key, value in payload.items():
            found.add(str(key))
            found.update(_collect_keys(value))
    elif isinstance(payload, list):
        for item in payload:
            found.update(_collect_keys(item))
    return found


@pytest.mark.asyncio
async def test_every_internal_route_leaks_no_plan_task_or_ai_text(
    async_client, session_factory
) -> None:
    """Every /internal route response contains neither the secret marker nor forbidden content keys."""
    marker = "TOP_SECRET_FALCON_MARKER_99182736"
    world = await build_internal_world(session_factory, marker=marker)
    headers = _auth(world.staff_token)

    for case in INTERNAL_REGISTRY:
        url = _url(case, world)
        body = case.body_for_world(world)
        response = await async_client.request(
            case.method, url, headers=headers, json=body
        )
        assert response.status_code in (200, 201, 204), (
            case.method,
            url,
            response.text,
        )
        assert marker not in response.text, (
            f"Marker leaked in {case.method} {url}: {response.text}"
        )
        if response.status_code != 204 and response.text:
            keys = _collect_keys(response.json())
            leaked_keys = keys & FORBIDDEN_INTERNAL_KEYS
            assert not leaked_keys, (
                f"Forbidden keys {sorted(leaked_keys)} in {case.method} {url}"
            )

    # Also re-check read endpoints after the mutations above populated audit-log
    for read_path in (
        "/internal/orgs?q=Northstar",
        f"/internal/orgs/{world.org_id}",
        f"/internal/users?q={world.member_email}",
        f"/internal/users/{world.member_user_id}",
        "/internal/ai-usage",
        f"/internal/ai-usage/{world.org_id}/daily",
        "/internal/audit-log",
        "/internal/health",
    ):
        response = await async_client.get(read_path, headers=headers)
        assert response.status_code == 200, (read_path, response.text)
        assert marker not in response.text, f"Marker leaked in GET {read_path}"
        keys = _collect_keys(response.json())
        leaked_keys = keys & FORBIDDEN_INTERNAL_KEYS
        assert not leaked_keys, (
            f"Forbidden keys {sorted(leaked_keys)} in GET {read_path}"
        )

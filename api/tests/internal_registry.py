"""Internal-surface access registry (docs/API.md §"/internal").

Every ``/internal`` route MUST appear here so three things stay in lockstep:

- the route-coverage test, which fails when a new ``/internal`` route ships
  untested (mirrors the customer tenancy registry);
- the access matrix, which calls every route with no token, a customer
  (``/app``-audience) token, a non-staff internal token and a staff token; and
- the privacy test, which calls every route and asserts no plan/task/AI text —
  or a ``title``/``why``/``notes``/``prompt``/``text`` key — appears in the
  serialized JSON.

Retained template routes (``GET /health``, ``POST /auth``, ``POST /logout``)
are excluded: they are deliberately public (health) or the login surface
itself, and covered by their own tests.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID


class InternalWorld:
    """Tokens and resource ids for one internal-matrix iteration."""

    def __init__(
        self,
        *,
        staff_token: str,
        second_staff_token: str,
        non_staff_token: str,
        customer_token: str,
        member_token: str,
        staff_user_id: UUID,
        second_staff_user_id: UUID,
        non_staff_user_id: UUID,
        member_user_id: UUID,
        org_id: UUID,
        user_id: UUID,
        user_email: str,
        member_email: str,
        staff_email: str,
        new_user_email: str,
        marker: str,
    ) -> None:
        self.staff_token = staff_token
        self.second_staff_token = second_staff_token
        self.non_staff_token = non_staff_token
        self.customer_token = customer_token
        self.member_token = member_token
        self.staff_user_id = staff_user_id
        self.second_staff_user_id = second_staff_user_id
        self.non_staff_user_id = non_staff_user_id
        self.member_user_id = member_user_id
        self.org_id = org_id
        self.user_id = user_id
        self.user_email = user_email
        self.member_email = member_email
        self.staff_email = staff_email
        self.new_user_email = new_user_email
        self.marker = marker


@dataclass(frozen=True)
class InternalRouteCase:
    """One ``/internal`` route and how to build a valid call against the world."""

    method: str
    path: str  # full path including the /internal mount
    ids_for_world: Callable[[InternalWorld], dict[str, str]] = lambda world: {}
    body_for_world: Callable[[InternalWorld], dict | None] = lambda world: None


def _org_ids(world: InternalWorld) -> dict[str, str]:
    return {"org_id": str(world.org_id)}


def _user_ids(world: InternalWorld) -> dict[str, str]:
    return {"user_id": str(world.user_id)}


def _new_user_body(world: InternalWorld) -> dict:
    return {
        "first_name": "New",
        "last_name": "Person",
        "email": world.new_user_email,
        "password": "secret123",
        "is_admin": False,
        "is_active": True,
    }


INTERNAL_REGISTRY: list[InternalRouteCase] = [
    InternalRouteCase("GET", "/internal/orgs"),
    InternalRouteCase("GET", "/internal/orgs/{org_id}", _org_ids),
    InternalRouteCase(
        "POST",
        "/internal/orgs/{org_id}/suspend",
        _org_ids,
        lambda world: {"reason": "Abuse report from support"},
    ),
    InternalRouteCase("POST", "/internal/orgs/{org_id}/reinstate", _org_ids),
    InternalRouteCase("GET", "/internal/users"),
    InternalRouteCase("GET", "/internal/users/self"),
    InternalRouteCase("GET", "/internal/users/{user_id}", _user_ids),
    InternalRouteCase(
        "POST",
        "/internal/users/{user_id}/deactivate",
        _user_ids,
        lambda world: {"reason": "Left the company"},
    ),
    InternalRouteCase("POST", "/internal/users/{user_id}/reactivate", _user_ids),
    InternalRouteCase("POST", "/internal/users", body_for_world=_new_user_body),
    InternalRouteCase(
        "PATCH",
        "/internal/users/{user_id}",
        _user_ids,
        lambda world: {"last_name": "Renamed"},
    ),
    InternalRouteCase(
        "POST",
        "/internal/users/{user_id}/change-password",
        _user_ids,
        lambda world: {"password": "newsecret1"},
    ),
    InternalRouteCase("DELETE", "/internal/users/{user_id}", _user_ids),
    InternalRouteCase("GET", "/internal/ai-usage"),
    InternalRouteCase("GET", "/internal/ai-usage/{org_id}/daily", _org_ids),
    InternalRouteCase("GET", "/internal/audit-log"),
]

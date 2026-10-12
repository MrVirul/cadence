"""Tenancy-matrix registry (docs/API.md "Tenancy rules as testable statements").

Every customer route under ``/app/orgs/{org_id}/...`` MUST be listed here with
its method, its exact path template, the minimum org role allowed to call it,
and factories that build a valid request against Org A's resources. The route
coverage test in ``test_tenancy_matrix.py`` fails when a new org-scoped route
ships without a registry entry, so a new endpoint cannot go untested.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

OrgRole = Literal["member", "admin", "owner"]


class World:
    """Fixtures for one matrix iteration: orgs A, B and a suspended org C.

    Tokens are raw app-audience JWTs for real users; resource ids belong to the
    named org. A fresh world is built per test invocation so the mutations of
    one iteration never leak into another.
    """

    def __init__(
        self,
        *,
        org_a_id: uuid.UUID,
        org_b_id: uuid.UUID,
        org_c_id: uuid.UUID,
        owner_a_token: str,
        admin_a_token: str,
        member_a_token: str,
        member_b_token: str,
        member_c_token: str,
        target_membership_id: uuid.UUID,
        invite_id: uuid.UUID,
    ) -> None:
        self.org_a_id = org_a_id
        self.org_b_id = org_b_id
        self.org_c_id = org_c_id
        self.owner_a_token = owner_a_token
        self.admin_a_token = admin_a_token
        self.member_a_token = member_a_token
        self.member_b_token = member_b_token
        self.member_c_token = member_c_token
        self.target_membership_id = target_membership_id
        self.invite_id = invite_id


@dataclass(frozen=True)
class RouteCase:
    """One org-scoped route and how to build a valid request for org A."""

    method: str
    path: str  # exact route template, e.g. "/app/orgs/{org_id}/members/{membership_id}"
    min_role: OrgRole  # minimum role that may call the route
    ids_for_a: Callable[
        [World], dict[str, str]
    ]  # resource-id substitutions resolved against org A
    body_for_a: Callable[[World], dict | None]  # body of a VALID request against org A


TENANCY_REGISTRY: list[RouteCase] = [
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}",
        min_role="member",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: None,
    ),
    RouteCase(
        method="PATCH",
        path="/app/orgs/{org_id}",
        min_role="admin",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: {"name": "Renamed Org"},
    ),
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}/members",
        min_role="admin",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: None,
    ),
    RouteCase(
        method="PATCH",
        path="/app/orgs/{org_id}/members/{membership_id}",
        min_role="admin",
        ids_for_a=lambda world: {"membership_id": str(world.target_membership_id)},
        body_for_a=lambda world: {"role": "admin"},
    ),
    RouteCase(
        method="DELETE",
        path="/app/orgs/{org_id}/members/{membership_id}",
        min_role="admin",
        ids_for_a=lambda world: {"membership_id": str(world.target_membership_id)},
        body_for_a=lambda world: None,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/invites",
        min_role="admin",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: {"role": "member"},
    ),
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}/invites",
        min_role="admin",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: None,
    ),
    RouteCase(
        method="DELETE",
        path="/app/orgs/{org_id}/invites/{invite_id}",
        min_role="admin",
        ids_for_a=lambda world: {"invite_id": str(world.invite_id)},
        body_for_a=lambda world: None,
    ),
]

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
        team_a_id: uuid.UUID,
        team_member_a_token: str,
        team_member_a_membership_id: uuid.UUID,
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
        # Team fixtures. ``team_a`` is a team of Org A whose members are
        # ``team_member_a`` (a plain member) and ``target``. ``member_a`` is the
        # org's other plain member, deliberately NOT in ``team_a``: the matrix
        # uses them as the "outsider" for team-scoped routes.
        self.team_a_id = team_a_id
        self.team_member_a_token = team_member_a_token
        self.team_member_a_membership_id = team_member_a_membership_id


@dataclass(frozen=True)
class RouteCase:
    """One org-scoped route and how to build a valid request for org A.

    ``min_role`` is the minimum org role that may call the route and drives the
    success leg of the matrix. ``outsider_status`` is the status a plain
    ``member`` who is *not* in the relevant team (``member_a``) gets; it is
    ``403`` for purely role-gated routes and ``404`` for team routes where a
    non-member must not learn the team exists. When ``team_member_status`` is
    set, the matrix additionally calls the route as a plain member who *is* in
    the team (``team_member_a``) and asserts that status — ``403`` where only
    admins may write, ``200`` where teammates may read.
    """

    method: str
    path: str  # exact route template, e.g. "/app/orgs/{org_id}/members/{membership_id}"
    min_role: OrgRole  # minimum role that may call the route
    ids_for_a: Callable[
        [World], dict[str, str]
    ]  # resource-id substitutions resolved against org A
    body_for_a: Callable[[World], dict | None]  # body of a VALID request against org A
    outsider_status: int = 403  # plain member NOT in the team / below min role
    team_member_status: int | None = None  # plain member IN the team (None: n/a)


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
    # --- Teams ---
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}/teams",
        min_role="member",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: None,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/teams",
        min_role="admin",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: {"name": "New Team"},
    ),
    # Reading a team is allowed to any of its members, so a plain member of the
    # team succeeds (``team_member_status=200``) while an org member who is not
    # in the team gets an indistinguishable 404. The success leg still uses an
    # admin token (``min_role="admin"``) because the ladder only models roles.
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}/teams/{team_id}",
        min_role="admin",
        ids_for_a=lambda world: {"team_id": str(world.team_a_id)},
        body_for_a=lambda world: None,
        outsider_status=404,
        team_member_status=200,
    ),
    RouteCase(
        method="PATCH",
        path="/app/orgs/{org_id}/teams/{team_id}",
        min_role="admin",
        ids_for_a=lambda world: {"team_id": str(world.team_a_id)},
        body_for_a=lambda world: {"name": "Renamed Team"},
        outsider_status=404,
        team_member_status=403,
    ),
    RouteCase(
        method="DELETE",
        path="/app/orgs/{org_id}/teams/{team_id}",
        min_role="admin",
        ids_for_a=lambda world: {"team_id": str(world.team_a_id)},
        body_for_a=lambda world: None,
        outsider_status=404,
        team_member_status=403,
    ),
    RouteCase(
        method="PUT",
        path="/app/orgs/{org_id}/teams/{team_id}/members",
        min_role="admin",
        ids_for_a=lambda world: {"team_id": str(world.team_a_id)},
        body_for_a=lambda world: {
            "membership_ids": [str(world.team_member_a_membership_id)]
        },
        outsider_status=404,
        team_member_status=403,
    ),
    RouteCase(
        method="PUT",
        path="/app/orgs/{org_id}/teams/{team_id}/lead",
        min_role="admin",
        ids_for_a=lambda world: {"team_id": str(world.team_a_id)},
        body_for_a=lambda world: {
            "membership_id": str(world.team_member_a_membership_id)
        },
        outsider_status=404,
        team_member_status=403,
    ),
]

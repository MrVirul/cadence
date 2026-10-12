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
        week_team_a_id: uuid.UUID,
        plan_team_a_id: uuid.UUID,
        draft_plan_id: uuid.UUID,
        draft_task_id: uuid.UUID,
        submitted_plan_id: uuid.UUID,
        approved_plan_id: uuid.UUID,
        next_week_start: str,
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
        # ``week_team_a`` is a second Org A team used only for the week/history
        # matrix legs: ``team_member`` is a *plain member* (not the lead) so the
        # teammate leg must be 403, and ``member`` is deliberately left out so
        # the outsider leg is 404. ``team_a`` itself cannot serve here because
        # ``team_member`` is its lead there and would get 200.
        self.week_team_a_id = week_team_a_id
        # Plan fixtures. ``plan_team_a`` is ``member_a``'s team (lead:
        # ``team_member_a``); ``member_a`` authors a draft, a submitted and an
        # approved plan in it, one per week. ``next_week_start`` is a valid
        # week for a fresh POST.
        self.plan_team_a_id = plan_team_a_id
        self.draft_plan_id = draft_plan_id
        self.draft_task_id = draft_task_id
        self.submitted_plan_id = submitted_plan_id
        self.approved_plan_id = approved_plan_id
        self.next_week_start = next_week_start


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
    # The week/history view is lead/admin only (docs/API.md §"Teams"). They use
    # ``week_team_a``, where ``team_member_a`` is a plain member: a teammate who
    # is not the lead can read the team but not its week, so 403; an org member
    # outside it gets an indistinguishable 404.
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}/teams/{team_id}/week",
        min_role="admin",
        ids_for_a=lambda world: {"team_id": str(world.week_team_a_id)},
        body_for_a=lambda world: None,
        outsider_status=404,
        team_member_status=403,
    ),
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}/teams/{team_id}/history",
        min_role="admin",
        ids_for_a=lambda world: {"team_id": str(world.week_team_a_id)},
        body_for_a=lambda world: None,
        outsider_status=404,
        team_member_status=403,
    ),
    # --- Plans & tasks ---
    # ``member_a`` authors every plan fixture in ``plan_team_a`` (lead:
    # ``team_member_a``), so the minimum-role success leg is ``member_a`` for
    # author-only routes and ``admin`` for approve/send-back. Where
    # ``team_member_a`` can read but not act, ``team_member_status`` is 403.
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}/plans",
        min_role="member",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: None,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/plans",
        min_role="member",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: {
            "week_start": world.next_week_start,
            "team_id": str(world.plan_team_a_id),
            "tasks": [
                {"kind": "main", "title": "Ship the thing", "why": "Users need it"}
            ],
        },
    ),
    RouteCase(
        method="GET",
        path="/app/orgs/{org_id}/plans/{plan_id}",
        min_role="member",
        ids_for_a=lambda world: {"plan_id": str(world.draft_plan_id)},
        body_for_a=lambda world: None,
        team_member_status=200,
    ),
    RouteCase(
        method="PUT",
        path="/app/orgs/{org_id}/plans/{plan_id}",
        min_role="member",
        ids_for_a=lambda world: {"plan_id": str(world.draft_plan_id)},
        body_for_a=lambda world: {
            "tasks": [
                {
                    "kind": "main",
                    "title": "Ship the weekly plan",
                    "why": "Teams need a shared commitment",
                }
            ]
        },
        team_member_status=403,
    ),
    RouteCase(
        method="PATCH",
        path="/app/orgs/{org_id}/tasks/{task_id}",
        min_role="member",
        ids_for_a=lambda world: {"task_id": str(world.draft_task_id)},
        body_for_a=lambda world: {"status": "done"},
        team_member_status=403,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/plans/{plan_id}/submit",
        min_role="member",
        ids_for_a=lambda world: {"plan_id": str(world.draft_plan_id)},
        body_for_a=lambda world: None,
        team_member_status=403,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/plans/{plan_id}/withdraw",
        min_role="member",
        ids_for_a=lambda world: {"plan_id": str(world.submitted_plan_id)},
        body_for_a=lambda world: None,
        team_member_status=403,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/plans/{plan_id}/approve",
        min_role="admin",
        ids_for_a=lambda world: {"plan_id": str(world.submitted_plan_id)},
        body_for_a=lambda world: None,
        outsider_status=403,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/plans/{plan_id}/send-back",
        min_role="admin",
        ids_for_a=lambda world: {"plan_id": str(world.submitted_plan_id)},
        body_for_a=lambda world: {"comment": "Tighten the scope and make it checkable"},
        outsider_status=403,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/plans/{plan_id}/close",
        min_role="member",
        ids_for_a=lambda world: {"plan_id": str(world.approved_plan_id)},
        body_for_a=lambda world: {"shipped": True},
        team_member_status=403,
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/ai/plan-review",
        min_role="member",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: {
            "week_start": world.next_week_start,
            "tasks": [
                {
                    "ref": "t1",
                    "kind": "main",
                    "title": "Checkout handles expired cards",
                    "why": "Users are blocked at payment",
                },
                # A GTM task keeps the review validator's go-to-market backstop
                # quiet so the matrix's success leg reaches the stub model.
                {"ref": "t2", "kind": "gtm", "title": "Ship a changelog entry"},
            ],
        },
    ),
    RouteCase(
        method="POST",
        path="/app/orgs/{org_id}/ai/plan-draft",
        min_role="member",
        ids_for_a=lambda world: {},
        body_for_a=lambda world: {
            "week_start": world.next_week_start,
            "notes": "Ship checkout, track conversion, and update changelog",
        },
    ),
]

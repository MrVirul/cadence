"""Org-scoped access control (tenancy core, docs/API.md §"Access semantics").

Every customer route under ``/app/orgs/{org_id}/...`` resolves the caller's
membership through :func:`get_org_context` (no membership → ``404`` with the
same body as a missing org; suspended org → ``403 org_suspended``) and then
gates on the org role with the ``require_org_*`` dependencies.

Two invariants every org-scoped route must follow:

- `get_org_context` is the ONLY way to turn a path ``org_id`` into a resource;
  none of the org's ids may be trusted from request bodies (schemas use
  ``extra="forbid"``).
- :func:`get_in_org` must be used for any by-id fetch: the query filters by
  ``org_id`` so a row living in another org is indistinguishable from a missing
  row (``404 not_found``). The helper in this module is the org-scoped sibling
  of ``access.get_user_by_id``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal, cast

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.app.access import CurrentUser
from app.database import DBSession
from app.exceptions import (
    OrgSuspendedException,
    ResourceNotFoundException,
    RoleForbiddenException,
)
from app.models import Membership, Organization

OrgRole = Literal["owner", "admin", "member"]

_ROLE_RANK: dict[str, int] = {"member": 1, "admin": 2, "owner": 3}
_LAST_ACTIVE_INTERVAL = timedelta(minutes=5)
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass
class OrgContext:
    """The resolved org, the caller's membership in it, and their org role."""

    org: Organization
    membership: Membership
    role: OrgRole


async def get_org_context(
    org_id: uuid.UUID,
    current_user: CurrentUser,
    session: DBSession,
    request: Request,
) -> OrgContext:
    """Resolve a request's org-scoped identity.

    - No membership in ``org_id`` — whether the org exists or not — → ``404
      not_found`` with an identical body, so org existence is never disclosed.
    - Suspended org → ``403 org_suspended`` for its members.
    - Otherwise return the context, opportunistically refreshing
      ``last_active_at`` on mutating requests (at most once per 5 minutes).
    """
    row = (
        await session.execute(
            select(Membership, Organization)
            .join(Organization, Organization.id == Membership.org_id)
            .where(Membership.org_id == org_id, Membership.user_id == current_user.id)
        )
    ).one_or_none()
    if row is None:
        raise ResourceNotFoundException("Organization not found")
    membership, org = row

    if org.is_suspended:
        raise OrgSuspendedException()

    if request.method in _MUTATING_METHODS and (
        org.last_active_at is None
        or org.last_active_at < datetime.now(UTC) - _LAST_ACTIVE_INTERVAL
    ):
        org.last_active_at = datetime.now(UTC)
        await session.flush()

    return OrgContext(
        org=org, membership=membership, role=cast(OrgRole, membership.role)
    )


async def _require_org_member(ctx: OrgContextDependency) -> OrgContext:
    """Any member of the org. `get_org_context` already 404s non-members."""
    return ctx


async def _require_org_admin(ctx: OrgContextDependency) -> OrgContext:
    if _ROLE_RANK[ctx.role] < _ROLE_RANK["admin"]:
        raise RoleForbiddenException()
    return ctx


async def _require_org_owner(ctx: OrgContextDependency) -> OrgContext:
    if _ROLE_RANK[ctx.role] < _ROLE_RANK["owner"]:
        raise RoleForbiddenException()
    return ctx


# Dependency aliases for route signatures: the guards are intentionally named
# `org_*` so they can never be confused with platform staff (`is_platform_staff`).
OrgContextDependency = Annotated[OrgContext, Depends(get_org_context)]
require_org_member = Annotated[OrgContext, Depends(_require_org_member)]
require_org_admin = Annotated[OrgContext, Depends(_require_org_admin)]
require_org_owner = Annotated[OrgContext, Depends(_require_org_owner)]


async def get_in_org(
    session: AsyncSession,
    model: type[Any],
    id_: Any,
    org_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Any:
    """Fetch a tenant row by id, but only when it belongs to ``org_id``.

    Every org-scoped by-id query must go through this helper (or filter by
    ``org_id`` explicitly): a row that exists in another org is
    indistinguishable from a missing one (``404 not_found``), so callers can
    never learn that a cross-org resource exists.

    ``for_update=True`` adds ``SELECT ... FOR UPDATE`` so a caller can serialize
    concurrent writes on the row for the rest of the request's transaction
    (services flush, the router commits).
    """
    statement = select(model).where(model.id == id_, model.org_id == org_id)
    if for_update:
        statement = statement.with_for_update()
    row = await session.scalar(statement)
    if row is None:
        raise ResourceNotFoundException("Resource not found")
    return row

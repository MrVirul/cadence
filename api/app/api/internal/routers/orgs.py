"""Internal org routes (docs/API.md §"/internal"). Staff-only metadata.

Staff see counts, status and member identities — never plan, task or AI text.
"""

import uuid

from fastapi import APIRouter, Query

from app.api.internal.access import CurrentInternalUser
from app.api.internal.schemas import (
    InternalOrgResponse,
    OrgDetailResponse,
    OrgListItem,
    OrgListResponse,
    OrgSuspendRequest,
)
from app.database import DBSession
from app.services.internal import InternalOrgService

router = APIRouter()


@router.get("/orgs", tags=["orgs"])
async def org_list(
    current_user: CurrentInternalUser,
    session: DBSession,
    q: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> OrgListResponse:
    items, total = await InternalOrgService(session).list_orgs(
        q=q, limit=limit, offset=offset
    )
    return OrgListResponse(
        items=[OrgListItem(**item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/orgs/{org_id}", tags=["orgs"])
async def org_detail(
    current_user: CurrentInternalUser,
    session: DBSession,
    org_id: uuid.UUID,
) -> OrgDetailResponse:
    return OrgDetailResponse(**await InternalOrgService(session).get_org(org_id))


@router.post("/orgs/{org_id}/suspend", tags=["orgs"])
async def org_suspend(
    current_user: CurrentInternalUser,
    session: DBSession,
    org_id: uuid.UUID,
    data: OrgSuspendRequest,
) -> InternalOrgResponse:
    org = await InternalOrgService(session).suspend(
        org_id, staff=current_user, reason=data.reason
    )
    await session.commit()
    return InternalOrgResponse.model_validate(org)


@router.post("/orgs/{org_id}/reinstate", tags=["orgs"])
async def org_reinstate(
    current_user: CurrentInternalUser,
    session: DBSession,
    org_id: uuid.UUID,
) -> InternalOrgResponse:
    org = await InternalOrgService(session).reinstate(org_id, staff=current_user)
    await session.commit()
    return InternalOrgResponse.model_validate(org)

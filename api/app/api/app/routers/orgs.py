from fastapi import APIRouter, status

from app.api.app.access import CurrentUser
from app.api.app.org_access import require_org_admin, require_org_member
from app.api.app.schemas import OrgCreateRequest, OrgResponse, OrgUpdateRequest
from app.database import DBSession
from app.services.organizations import OrganizationService

router = APIRouter()


@router.post("/orgs", status_code=status.HTTP_201_CREATED, tags=["orgs"])
async def create_org(
    data: OrgCreateRequest,
    current_user: CurrentUser,
    session: DBSession,
) -> OrgResponse:
    # An existing user creates another org and becomes its owner. The slug is
    # server-generated and de-duplicated, so no slug conflict is reachable.
    org, _ = await OrganizationService(session).create_with_owner(
        name=data.name, user=current_user
    )
    await session.commit()
    return OrgResponse.model_validate(org)


@router.get("/orgs/{org_id}", tags=["orgs"])
async def get_org(ctx: require_org_member) -> OrgResponse:
    return OrgResponse.model_validate(ctx.org)


@router.patch("/orgs/{org_id}", tags=["orgs"])
async def update_org(
    data: OrgUpdateRequest,
    ctx: require_org_admin,
    session: DBSession,
) -> OrgResponse:
    if data.name is not None:
        await OrganizationService(session).rename(ctx.org, data.name)
        await session.commit()
    return OrgResponse.model_validate(ctx.org)

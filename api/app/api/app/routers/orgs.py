from fastapi import APIRouter, status

from app.api.app.access import CurrentUser
from app.api.app.schemas import OrgCreateRequest, OrgResponse
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

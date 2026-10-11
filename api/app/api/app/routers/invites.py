from typing import cast

from fastapi import APIRouter, status

from app.api.app.access import CurrentUser
from app.api.app.schemas import (
    AcceptedMembership,
    InviteAcceptResponse,
    InvitePreviewResponse,
    InviteRole,
)
from app.database import DBSession
from app.services.invites import InviteService

router = APIRouter()


@router.get("/invites/{token}", tags=["invites"])
async def preview_invite(token: str, session: DBSession) -> InvitePreviewResponse:
    org_name, role = await InviteService(session).preview(token)
    return InvitePreviewResponse(org_name=org_name, role=cast(InviteRole, role))


@router.post(
    "/invites/{token}/accept",
    status_code=status.HTTP_201_CREATED,
    tags=["invites"],
)
async def accept_invite(
    token: str, current_user: CurrentUser, session: DBSession
) -> InviteAcceptResponse:
    membership = await InviteService(session).accept(token, current_user)
    await session.commit()
    return InviteAcceptResponse(
        membership=AcceptedMembership(
            org_id=membership.org_id, role=cast(InviteRole, membership.role)
        )
    )

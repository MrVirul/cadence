import uuid
from typing import cast

from fastapi import APIRouter, Query, Response, status

from app.api.app.access import CurrentUser
from app.api.app.org_access import require_org_admin
from app.api.app.schemas import (
    AcceptedMembership,
    InviteAcceptResponse,
    InviteCreateRequest,
    InvitePreviewResponse,
    InviteResponse,
    InviteRole,
)
from app.config import settings
from app.database import DBSession
from app.models import Invite
from app.schemas import PageResponse
from app.services.invites import InviteService

router = APIRouter()


def _invite_response(invite: Invite) -> InviteResponse:
    return InviteResponse(
        id=invite.id,
        token=invite.token,
        role=cast(InviteRole, invite.role),
        expires_at=invite.expires_at,
        url=f"{settings.APP_URL}/invite/{invite.token}",
    )


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


@router.post(
    "/orgs/{org_id}/invites",
    status_code=status.HTTP_201_CREATED,
    tags=["invites"],
)
async def create_invite(
    data: InviteCreateRequest,
    ctx: require_org_admin,
    session: DBSession,
) -> InviteResponse:
    invite = await InviteService(session).create(
        org_id=ctx.org.id,
        role=data.role,
        expires_in_days=data.expires_in_days,
        created_by_membership_id=ctx.membership.id,
    )
    await session.commit()
    return _invite_response(invite)


@router.get("/orgs/{org_id}/invites", tags=["invites"])
async def list_invites(
    ctx: require_org_admin,
    session: DBSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PageResponse[InviteResponse]:
    rows, total = await InviteService(session).list_valid(
        org_id=ctx.org.id, limit=limit, offset=offset
    )
    return PageResponse(
        items=[_invite_response(invite) for invite in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/orgs/{org_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["invites"],
)
async def revoke_invite(
    invite_id: uuid.UUID,
    ctx: require_org_admin,
    session: DBSession,
) -> Response:
    await InviteService(session).revoke(invite_id=invite_id, org_id=ctx.org.id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

import uuid
from typing import cast

from fastapi import APIRouter, Query, Response, status

from app.api.app.org_access import require_org_admin
from app.api.app.schemas import (
    MemberRoleUpdateRequest,
    MembershipResponse,
    MemberUser,
    OrgRole,
)
from app.database import DBSession
from app.models import Membership, User
from app.schemas import PageResponse
from app.services.memberships import MembershipService

router = APIRouter()


def _membership_response(membership: Membership, user: User) -> MembershipResponse:
    return MembershipResponse(
        membership_id=membership.id,
        user=MemberUser(
            id=user.id,
            name=f"{user.first_name} {user.last_name}".strip(),
            email=user.email,
        ),
        role=cast(OrgRole, membership.role),
        created_at=membership.created_at,
    )


@router.get("/orgs/{org_id}/members", tags=["members"])
async def list_members(
    ctx: require_org_admin,
    session: DBSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PageResponse[MembershipResponse]:
    rows, total = await MembershipService(session).list_members(
        org_id=ctx.org.id, limit=limit, offset=offset
    )
    return PageResponse(
        items=[_membership_response(membership, user) for membership, user in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch("/orgs/{org_id}/members/{membership_id}", tags=["members"])
async def update_member_role(
    membership_id: uuid.UUID,
    data: MemberRoleUpdateRequest,
    ctx: require_org_admin,
    session: DBSession,
) -> MembershipResponse:
    membership = await MembershipService(session).update_role(
        actor=ctx, target_membership_id=membership_id, new_role=data.role
    )
    await session.commit()
    user = await session.get(User, membership.user_id)
    assert user is not None  # FK invariant: the membership always points at a user
    return _membership_response(membership, user)


@router.delete(
    "/orgs/{org_id}/members/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["members"],
)
async def remove_member(
    membership_id: uuid.UUID,
    ctx: require_org_admin,
    session: DBSession,
) -> Response:
    await MembershipService(session).remove(
        actor=ctx, target_membership_id=membership_id
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

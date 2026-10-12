import uuid
from typing import cast

from fastapi import APIRouter, Query, Response, status

from app.api.app.org_access import require_org_admin, require_org_member
from app.api.app.schemas import (
    MemberUser,
    OrgRole,
    TeamCreateRequest,
    TeamDetailResponse,
    TeamLeadRequest,
    TeamMemberResponse,
    TeamMembersRequest,
    TeamResponse,
    TeamUpdateRequest,
)
from app.database import DBSession
from app.models import Membership, Team, User
from app.schemas import PageResponse
from app.services.teams import TeamService

router = APIRouter()


def _team_response(team: Team, member_count: int) -> TeamResponse:
    return TeamResponse(
        id=team.id,
        name=team.name,
        lead_membership_id=team.lead_membership_id,
        member_count=member_count,
    )


def _team_member_response(membership: Membership, user: User) -> TeamMemberResponse:
    return TeamMemberResponse(
        membership_id=membership.id,
        user=MemberUser(
            id=user.id,
            name=f"{user.first_name} {user.last_name}".strip(),
            email=user.email,
        ),
        role=cast(OrgRole, membership.role),
    )


def _team_detail(
    team: Team, members: list[tuple[Membership, User]]
) -> TeamDetailResponse:
    return TeamDetailResponse(
        id=team.id,
        name=team.name,
        lead_membership_id=team.lead_membership_id,
        member_count=len(members),
        members=[_team_member_response(m, u) for m, u in members],
    )


@router.get("/orgs/{org_id}/teams", tags=["teams"])
async def list_teams(
    ctx: require_org_member,
    session: DBSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PageResponse[TeamResponse]:
    rows, total = await TeamService(session).list_teams(
        ctx=ctx, limit=limit, offset=offset
    )
    return PageResponse(
        items=[_team_response(team, count) for team, count in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/orgs/{org_id}/teams", status_code=status.HTTP_201_CREATED, tags=["teams"]
)
async def create_team(
    data: TeamCreateRequest,
    ctx: require_org_admin,
    session: DBSession,
) -> TeamResponse:
    service = TeamService(session)
    team = await service.create(
        ctx=ctx, name=data.name, lead_membership_id=data.lead_membership_id
    )
    count = await service.member_count(team.id)
    await session.commit()
    return _team_response(team, count)


@router.get("/orgs/{org_id}/teams/{team_id}", tags=["teams"])
async def get_team(
    team_id: uuid.UUID,
    ctx: require_org_member,
    session: DBSession,
) -> TeamDetailResponse:
    team, members = await TeamService(session).get_detail(ctx=ctx, team_id=team_id)
    return _team_detail(team, members)


@router.patch("/orgs/{org_id}/teams/{team_id}", tags=["teams"])
async def update_team(
    team_id: uuid.UUID,
    data: TeamUpdateRequest,
    ctx: require_org_member,
    session: DBSession,
) -> TeamResponse:
    service = TeamService(session)
    if data.name is not None:
        team = await service.rename(ctx=ctx, team_id=team_id, name=data.name)
    else:
        team = await service.get_for_write(ctx=ctx, team_id=team_id)
    count = await service.member_count(team.id)
    await session.commit()
    return _team_response(team, count)


@router.delete(
    "/orgs/{org_id}/teams/{team_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["teams"],
)
async def delete_team(
    team_id: uuid.UUID,
    ctx: require_org_member,
    session: DBSession,
) -> Response:
    await TeamService(session).delete(ctx=ctx, team_id=team_id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/orgs/{org_id}/teams/{team_id}/members", tags=["teams"])
async def replace_team_members(
    team_id: uuid.UUID,
    data: TeamMembersRequest,
    ctx: require_org_member,
    session: DBSession,
) -> TeamDetailResponse:
    service = TeamService(session)
    team = await service.replace_members(
        ctx=ctx, team_id=team_id, membership_ids=list(data.membership_ids)
    )
    members = await service.list_members(team_id=team.id)
    await session.commit()
    return _team_detail(team, members)


@router.put("/orgs/{org_id}/teams/{team_id}/lead", tags=["teams"])
async def set_team_lead(
    team_id: uuid.UUID,
    data: TeamLeadRequest,
    ctx: require_org_member,
    session: DBSession,
) -> TeamResponse:
    service = TeamService(session)
    team = await service.set_lead(
        ctx=ctx, team_id=team_id, membership_id=data.membership_id
    )
    count = await service.member_count(team.id)
    await session.commit()
    return _team_response(team, count)

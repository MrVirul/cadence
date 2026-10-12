"""Internal audit-log route (docs/API.md §"/internal").

A read-only view of ``staff_actions`` — who did what to which org or user, and
why. Target names are org names / user emails, never plan text.
"""

from fastapi import APIRouter, Query

from app.api.internal.access import CurrentInternalUser
from app.api.internal.schemas import AuditLogItem, AuditLogResponse
from app.database import DBSession
from app.services.internal import InternalAuditService

router = APIRouter()


@router.get("/audit-log", tags=["audit"])
async def audit_log_list(
    current_user: CurrentInternalUser,
    session: DBSession,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> AuditLogResponse:
    items, total = await InternalAuditService(session).list_actions(
        limit=limit, offset=offset
    )
    return AuditLogResponse(
        items=[AuditLogItem(**item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )

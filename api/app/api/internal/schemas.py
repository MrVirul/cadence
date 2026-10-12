from __future__ import annotations

from datetime import date

from pydantic import UUID4, EmailStr, Field

from app.schemas import DateTime, Model


class AuthRequest(Model):
    email: EmailStr
    password: str


class AuthResponse(Model):
    access_token: str


class UserOrgRef(Model):
    """An org the user belongs to and their role there (metadata only)."""

    id: UUID4
    name: str
    role: str


class InternalUserResponse(Model):
    """A user as staff see them: account metadata and org roles.

    ``first_name``/``last_name``/``is_admin``/``created_at`` are kept so the
    existing template console keeps compiling; ``name`` and ``orgs`` are the
    brief's shape (root ``AGENTS.md`` §6). No plan, task or AI text is ever part
    of a user response.
    """

    id: UUID4
    created_at: DateTime
    updated_at: DateTime | None
    first_name: str
    last_name: str
    name: str
    email: str
    is_admin: bool
    is_active: bool
    orgs: list[UserOrgRef] = Field(default_factory=list)


class UsersListResponse(Model):
    items: list[InternalUserResponse]
    total: int
    limit: int
    offset: int


class UserCreateRequest(Model):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)
    is_admin: bool = False
    is_active: bool = True


class UserUpdateRequest(Model):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    is_admin: bool | None = None
    is_active: bool | None = None


class UserChangePasswordRequest(Model):
    password: str = Field(min_length=8)


class UserDeactivateRequest(Model):
    """A deactivation must carry a reason for the audit trail."""

    reason: str = Field(min_length=3, max_length=500)


class InternalOrgResponse(Model):
    id: UUID4
    name: str
    slug: str
    is_suspended: bool
    suspended_at: DateTime | None
    suspended_reason: str | None
    last_active_at: DateTime | None
    created_at: DateTime


class OrgListItem(InternalOrgResponse):
    member_count: int
    team_count: int
    plan_count: int


class OrgListResponse(Model):
    items: list[OrgListItem]
    total: int
    limit: int
    offset: int


class OrgMemberRow(Model):
    """One member of an org: identity and role, never their plans."""

    email: str
    name: str
    role: str


class OrgDetailResponse(OrgListItem):
    members: list[OrgMemberRow]


class OrgSuspendRequest(Model):
    reason: str = Field(min_length=3, max_length=500)


class AiUsageRow(Model):
    """Per-org AI usage over a date range (metadata; no prompt or output text)."""

    org_id: UUID4
    org_name: str
    calls: int
    failures: int
    rate_limited: int
    p50_latency_ms: float | None
    avg_latency_ms: float | None
    input_tokens: int
    output_tokens: int


class AiUsageListResponse(Model):
    items: list[AiUsageRow]
    total: int
    limit: int
    offset: int


class AiUsageDay(Model):
    date: date
    calls: int
    failures: int
    rate_limited: int


class AiUsageDailyResponse(Model):
    days: list[AiUsageDay]


class AuditLogItem(Model):
    id: UUID4
    created_at: DateTime
    staff_user_id: UUID4
    staff_email: str
    staff_name: str
    action: str
    target_type: str
    target_id: UUID4
    target_name: str
    reason: str | None


class AuditLogResponse(Model):
    items: list[AuditLogItem]
    total: int
    limit: int
    offset: int

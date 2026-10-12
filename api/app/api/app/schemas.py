from __future__ import annotations

from typing import Literal

from pydantic import UUID4, ConfigDict, EmailStr, Field, model_validator

from app.schemas import DateTime, Model

# Org roles and the subset an invite may grant. Kept as `Literal`s so responses
# advertise the allowed values; services always store the same string values.
OrgRole = Literal["owner", "admin", "member"]
InviteRole = Literal["admin", "member"]


class RequestModel(Model):
    """Request schemas reject unknown fields.

    This is the tenancy guard at the schema layer: a client can never smuggle in
    a server-controlled column (`org_id`, `role`, `is_admin`, `status`, ...).
    """

    model_config = ConfigDict(
        extra="forbid", str_strip_whitespace=True, from_attributes=True
    )


class AuthRequest(RequestModel):
    email: EmailStr
    password: str


class AuthResponse(Model):
    access_token: str


class SignupRequest(RequestModel):
    email: EmailStr
    password: str = Field(min_length=10)
    name: str | None = Field(default=None, max_length=200)
    # Exactly one of these must be supplied; enforced below.
    org_name: str | None = Field(default=None, min_length=1, max_length=200)
    invite_token: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def _exactly_one_target(self) -> SignupRequest:
        if (self.org_name is None) == (self.invite_token is None):
            raise ValueError("Provide exactly one of org_name or invite_token")
        return self


class UserResponse(Model):
    id: UUID4
    created_at: DateTime
    updated_at: DateTime | None
    first_name: str
    last_name: str
    email: str


class OrgResponse(Model):
    id: UUID4
    name: str
    slug: str
    created_at: DateTime


class SignupMembership(Model):
    org_id: UUID4
    org_name: str
    role: OrgRole


class SignupResponse(Model):
    access_token: str
    user: UserResponse
    membership: SignupMembership


class MeMembership(Model):
    org: OrgResponse
    role: OrgRole


class MeResponse(Model):
    user: UserResponse
    memberships: list[MeMembership]


class OrgCreateRequest(RequestModel):
    name: str = Field(min_length=1, max_length=200)


class InvitePreviewResponse(Model):
    org_name: str
    role: InviteRole


class AcceptedMembership(Model):
    org_id: UUID4
    role: InviteRole


class InviteAcceptResponse(Model):
    membership: AcceptedMembership


class OrgUpdateRequest(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)


class MemberUser(Model):
    id: UUID4
    name: str
    email: str


class MembershipResponse(Model):
    membership_id: UUID4
    user: MemberUser
    role: OrgRole
    created_at: DateTime


class MemberRoleUpdateRequest(RequestModel):
    role: OrgRole


class InviteCreateRequest(RequestModel):
    role: InviteRole
    expires_in_days: int | None = Field(default=None, ge=1, le=30)


class InviteResponse(Model):
    id: UUID4
    token: str
    role: InviteRole
    expires_at: DateTime
    url: str


class TeamCreateRequest(RequestModel):
    name: str = Field(min_length=1, max_length=100)
    lead_membership_id: UUID4 | None = None


class TeamUpdateRequest(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)


class TeamMembersRequest(RequestModel):
    membership_ids: list[UUID4] = Field(default_factory=list)


class TeamLeadRequest(RequestModel):
    membership_id: UUID4


class TeamResponse(Model):
    id: UUID4
    name: str
    lead_membership_id: UUID4 | None
    member_count: int


class TeamMemberResponse(Model):
    membership_id: UUID4
    user: MemberUser
    role: OrgRole


class TeamDetailResponse(TeamResponse):
    members: list[TeamMemberResponse]

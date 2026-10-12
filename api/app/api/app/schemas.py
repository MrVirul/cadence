from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import UUID4, ConfigDict, EmailStr, Field, model_validator

from app.schemas import DateTime, Model

# Org roles and the subset an invite may grant. Kept as `Literal`s so responses
# advertise the allowed values; services always store the same string values.
OrgRole = Literal["owner", "admin", "member"]
InviteRole = Literal["admin", "member"]

# Plan/task domain literals. Same string values the models store (no DB enums).
TaskKind = Literal["main", "sub_goal", "gtm"]
TaskStatus = Literal["todo", "done"]
PlanStatus = Literal["draft", "submitted", "approved", "done"]
PlanEventAction = Literal["submitted", "withdrawn", "approved", "sent_back", "closed"]


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


# --- Plans & tasks (docs/API.md §"Plans & tasks") -------------------------


class TaskInput(RequestModel):
    """A task as sent by the client.

    ``id`` is omitted for a new task and present to update an existing one in
    place, so task ids stay stable across edits. Never declares ``org_id``,
    ``plan_id`` or ``status`` (server-controlled).
    """

    id: UUID4 | None = None
    kind: TaskKind
    title: str = Field(min_length=1, max_length=200)
    why: str | None = Field(default=None, max_length=500)
    position: int | None = Field(default=None, ge=0)


class PlanCreateRequest(RequestModel):
    week_start: date
    team_id: UUID4
    tasks: list[TaskInput] = Field(default_factory=list)


class PlanUpdateRequest(RequestModel):
    team_id: UUID4 | None = None
    tasks: list[TaskInput] = Field(default_factory=list)


class TaskStatusRequest(RequestModel):
    status: TaskStatus


class SendBackRequest(RequestModel):
    comment: str = Field(min_length=1, max_length=1000)


class PlanCloseRequest(RequestModel):
    shipped: bool


class PlanPerson(Model):
    membership_id: UUID4
    user: MemberUser


class PlanTaskResponse(Model):
    id: UUID4
    kind: TaskKind
    title: str
    why: str | None
    status: TaskStatus
    position: int
    done_at: DateTime | None


class PlanEventResponse(Model):
    id: UUID4
    actor_membership_id: UUID4 | None
    action: PlanEventAction
    comment: str | None
    self_approved: bool
    created_at: DateTime


class PlanResponse(Model):
    id: UUID4
    week_start: date
    status: PlanStatus
    team_id: UUID4
    author: PlanPerson
    submitted_at: DateTime | None
    decided_at: DateTime | None
    decided_by: PlanPerson | None
    decision_comment: str | None
    shipped: bool | None
    closed_at: DateTime | None
    created_at: DateTime
    updated_at: DateTime | None


class PlanDetailResponse(PlanResponse):
    tasks: list[PlanTaskResponse]
    events: list[PlanEventResponse]


class PlanListItem(Model):
    """List row: counts and status only — never task text (least privilege)."""

    id: UUID4
    week_start: date
    status: PlanStatus
    team_id: UUID4
    author: PlanPerson
    tasks_done: int
    tasks_total: int
    shipped: bool | None
    submitted_at: DateTime | None
    decided_at: DateTime | None
    created_at: DateTime
    updated_at: DateTime | None

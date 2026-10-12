import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.app.org_access import get_in_org
from app.exceptions import APIException, ConflictException
from app.models import Invite, Membership, Organization, User


class InviteInvalidException(APIException):
    def __init__(self) -> None:
        super().__init__(
            status_code=404,
            code="invite_invalid",
            message="This invite link is invalid or has expired",
        )


class InviteService:
    """Invite creation, listing and consumption.

    A valid invite is unused, not revoked and not expired. Consumption is a
    single conditional ``UPDATE ... WHERE accepted_at IS NULL AND revoked_at IS
    NULL AND expires_at > now() RETURNING`` so two concurrent accepts can never
    both succeed (docs/API.md rules 37).
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        org_id: uuid.UUID,
        role: str,
        expires_in_days: int | None,
        created_by_membership_id: uuid.UUID,
    ) -> Invite:
        """Issue a single-use invite; `expires_in_days` defaults to 7 days.

        `role` is schema-constrained to admin|member before it ever reaches
        this service, so an invite can never grant `owner`.
        """
        invite = Invite(
            org_id=org_id,
            token=token_urlsafe(32),
            role=role,
            created_by_membership_id=created_by_membership_id,
            expires_at=datetime.now(UTC) + timedelta(days=expires_in_days or 7),
        )
        self.session.add(invite)
        await self.session.flush()
        return invite

    async def list_valid(
        self, *, org_id: uuid.UUID, limit: int, offset: int
    ) -> tuple[Sequence[Invite], int]:
        """Page of invites that still work, newest first.

        Used, revoked and expired invites are excluded entirely: an admin only
        sees links that are currently redeemable (docs rule 41).
        """
        conditions = (
            Invite.org_id == org_id,
            Invite.accepted_at.is_(None),
            Invite.revoked_at.is_(None),
            Invite.expires_at > datetime.now(UTC),
        )
        total = await self.session.scalar(
            select(func.count()).select_from(Invite).where(*conditions)
        )
        result = await self.session.execute(
            select(Invite)
            .where(*conditions)
            .order_by(Invite.created_at.desc(), Invite.id)
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all(), total or 0

    async def revoke(self, *, invite_id: uuid.UUID, org_id: uuid.UUID) -> Invite:
        """Revoke an invite in this org (idempotent). Cross-org id → 404."""
        invite = await get_in_org(self.session, Invite, invite_id, org_id)
        invite.revoked_at = datetime.now(UTC)
        await self.session.flush()
        return invite

    async def preview(self, token: str) -> tuple[str, str]:
        """Return ``(org_name, role)`` for a still-valid invite, else 404."""
        row = (
            await self.session.execute(
                select(Organization.name, Invite.role)
                .join(Organization, Organization.id == Invite.org_id)
                .where(*self._valid_conditions(token, datetime.now(UTC)))
            )
        ).one_or_none()
        if row is None:
            raise InviteInvalidException()
        return row.name, row.role

    async def consume(self, token: str, user_id: uuid.UUID) -> tuple[uuid.UUID, str]:
        """Atomically mark the invite accepted by `user_id`; returns
        ``(org_id, role)``. 0 rows updated means it was invalid → 404."""
        row = (
            await self.session.execute(
                update(Invite)
                .where(*self._valid_conditions(token, datetime.now(UTC)))
                .values(accepted_at=datetime.now(UTC), accepted_by_user_id=user_id)
                .returning(Invite.org_id, Invite.role)
                .execution_options(synchronize_session=False)
            )
        ).one_or_none()
        if row is None:
            raise InviteInvalidException()
        return row.org_id, row.role

    async def accept(self, token: str, user: User) -> Membership:
        """Accept an invite for a logged-in user, creating the membership.

        The invite is granted role is used verbatim — invites can never carry
        `owner` (schema + DB check constraint), so this never creates an owner.
        """
        org_id, role = await self.consume(token, user.id)
        already = await self.session.scalar(
            select(Membership.id).where(
                Membership.org_id == org_id, Membership.user_id == user.id
            )
        )
        if already is not None:
            raise ConflictException("You are already a member of this organization")
        membership = Membership(org_id=org_id, user_id=user.id, role=role)
        self.session.add(membership)
        await self.session.flush()
        return membership

    @staticmethod
    def _valid_conditions(token: str, now: datetime) -> tuple:
        return (
            Invite.token == token,
            Invite.accepted_at.is_(None),
            Invite.revoked_at.is_(None),
            Invite.expires_at > now,
        )

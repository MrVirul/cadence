import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.app.org_access import OrgContext, get_in_org
from app.exceptions import LastOwnerException, RoleForbiddenException
from app.models import Membership, Organization, User


class MembershipService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_with_orgs(
        self, user_id: uuid.UUID
    ) -> Sequence[tuple[Membership, Organization]]:
        """Return a user's memberships with their organization loaded.

        The models declare no ORM relationships (lazy loads raise), so the join
        is explicit here.
        """
        result = await self.session.execute(
            select(Membership, Organization)
            .join(Organization, Organization.id == Membership.org_id)
            .where(Membership.user_id == user_id)
            .order_by(Organization.name)
        )
        return [(membership, org) for membership, org in result.all()]

    async def list_members(
        self, *, org_id: uuid.UUID, limit: int, offset: int
    ) -> tuple[Sequence[tuple[Membership, User]], int]:
        """Page of (membership, user) rows in an org, newest membership first."""
        total = await self.session.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.org_id == org_id)
        )
        result = await self.session.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.org_id == org_id)
            .order_by(Membership.created_at.desc(), Membership.id)
            .limit(limit)
            .offset(offset)
        )
        return [(membership, user) for membership, user in result.all()], total or 0

    async def update_role(
        self, *, actor: OrgContext, target_membership_id: uuid.UUID, new_role: str
    ) -> Membership:
        """Change a member's role.

        Serialized on the org row so two concurrent changes cannot both succeed
        (docs/API.md rule 36). An admin may only reassign member↔admin and can
        never touch owners; owners may change anyone, but the last owner can
        never be demoted.
        """
        await self._lock_org(actor.org.id)
        target = await get_in_org(
            self.session, Membership, target_membership_id, actor.org.id
        )
        if actor.role == "admin" and (target.role == "owner" or new_role == "owner"):
            raise RoleForbiddenException()
        if target.role == "owner" and new_role != "owner":
            await self._guard_last_owner(actor.org.id)
        target.role = new_role
        await self.session.flush()
        return target

    async def remove(
        self, *, actor: OrgContext, target_membership_id: uuid.UUID
    ) -> None:
        """Remove a member from the org.

        DB cascades as documented in DATA_MODEL.md: the member's team_members
        rows and plans are deleted, their team lead links are cleared, and
        invites they created are removed. The last owner can never be removed.
        """
        await self._lock_org(actor.org.id)
        target = await get_in_org(
            self.session, Membership, target_membership_id, actor.org.id
        )
        if actor.role == "admin" and target.role == "owner":
            raise RoleForbiddenException()
        if target.role == "owner":
            await self._guard_last_owner(actor.org.id)
        await self.session.delete(target)
        await self.session.flush()

    async def _guard_last_owner(self, org_id: uuid.UUID) -> None:
        if await self._count_owners(org_id) <= 1:
            raise LastOwnerException()

    async def _count_owners(self, org_id: uuid.UUID) -> int:
        return (
            await self.session.scalar(
                select(func.count())
                .select_from(Membership)
                .where(Membership.org_id == org_id, Membership.role == "owner")
            )
        ) or 0

    async def _lock_org(self, org_id: uuid.UUID) -> None:
        """Serialize concurrent role changes/removals on the organization row."""
        await self.session.execute(
            select(Organization.id).where(Organization.id == org_id).with_for_update()
        )

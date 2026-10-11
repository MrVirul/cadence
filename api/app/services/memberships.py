import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Membership, Organization


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

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Membership, Organization, User


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "org"


class OrganizationService:
    """Org creation. Fills only `name`/`slug`; membership is created by callers
    according to the caller's intent (owner on create, invite role on accept)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_with_owner(
        self, *, name: str, user: User
    ) -> tuple[Organization, Membership]:
        """Create an organization and make `user` its owner. One transaction."""
        org = Organization(name=name, slug=await self._unique_slug(name))
        self.session.add(org)
        await self.session.flush()

        membership = Membership(org_id=org.id, user_id=user.id, role="owner")
        self.session.add(membership)
        await self.session.flush()
        return org, membership

    async def _unique_slug(self, name: str) -> str:
        base = slugify(name)
        candidate = base
        suffix = 2
        while await self.session.scalar(
            select(Organization.id).where(Organization.slug == candidate)
        ):
            candidate = f"{base}-{suffix}"
            suffix += 1
        return candidate

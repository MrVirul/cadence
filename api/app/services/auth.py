from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Membership, Organization, User
from app.services.invites import InviteService
from app.services.organizations import OrganizationService
from app.services.users import UserService


def split_name(name: str | None, email: str) -> tuple[str, str]:
    """Derive first/last name from the optional `name` field.

    `name` is split on the first space; when absent, the email local-part is
    used so the two non-null `users` columns are always filled.
    """
    if name and name.strip():
        first, _, last = name.strip().partition(" ")
        return first, last.strip()
    local = email.split("@", 1)[0][:100] or "there"
    return local, ""


class AuthService:
    """Sign-up orchestration. Everything runs in the caller's transaction:
    services flush, the router commits once, so any failure writes nothing
    (docs/API.md "extra care" — sign-up)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserService(session)
        self.organizations = OrganizationService(session)
        self.invites = InviteService(session)

    async def signup(
        self,
        *,
        email: str,
        password: str,
        name: str | None,
        org_name: str | None,
        invite_token: str | None,
    ) -> tuple[User, Organization, Membership]:
        """Create the user (active, never staff) and either a new org where they
        are owner, or a membership granted by an invite."""
        first_name, last_name = split_name(name, email)
        user = await self.users.create_user(
            first_name=first_name,
            last_name=last_name,
            email=email,
            password=password,
            is_admin=False,
            is_active=True,
        )

        if org_name is not None:
            org, membership = await self.organizations.create_with_owner(
                name=org_name, user=user
            )
            return user, org, membership

        org_id, role = await self.invites.consume(invite_token or "", user.id)
        membership = Membership(org_id=org_id, user_id=user.id, role=role)
        self.session.add(membership)
        await self.session.flush()

        org = await self.session.get(Organization, org_id)
        if org is None:  # pragma: no cover - FK invariant, defensive
            raise RuntimeError("Invite referenced a missing organization")
        return user, org, membership

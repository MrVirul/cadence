"""POST /app/orgs and the invite preview/accept surface.

Invites are single-use and expire; a used/revoked/expired invite is `404
invite_invalid`; double-accept is race-safe (docs/API.md rule 37).
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe

import pytest
from faker import Faker
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import Invite, Membership, Organization, User
from app.security import hash_password

fake = Faker()

SIGNUP = "/app/auth/signup"


async def _auth_token(client, *, invite_token=None, org_name=None) -> str:
    body = {
        "email": fake.email().lower(),
        "password": "longenough1",
        "name": "New Person",
    }
    if invite_token:
        body["invite_token"] = invite_token
    else:
        body["org_name"] = org_name or "Acme Org"
    response = await client.post(SIGNUP, json=body)
    assert response.status_code == 201, response.json()
    return response.json()["access_token"]


async def _seed_invite(
    db,
    *,
    org: Organization | None = None,
    role: str = "member",
    expires_in: timedelta | None = None,
    used: bool = False,
    revoked: bool = False,
) -> tuple[Organization, Invite]:
    if org is None:
        org = Organization(name="Seed Org", slug=f"seed-{uuid.uuid4().hex[:10]}")
        owner = User(
            first_name="Owner",
            last_name="One",
            email=fake.email().lower(),
            password=hash_password("x"),
            is_active=True,
        )
        db.add_all([org, owner])
        await db.flush()
        membership = Membership(org_id=org.id, user_id=owner.id, role="owner")
        db.add(membership)
        await db.flush()
    else:
        membership = (
            (
                await db.execute(
                    select(Membership).where(
                        Membership.org_id == org.id, Membership.role == "owner"
                    )
                )
            )
            .scalars()
            .one()
        )

    invite = Invite(
        org_id=org.id,
        token=token_urlsafe(32),
        role=role,
        created_by_membership_id=membership.id,
        expires_at=datetime.now(UTC) + (expires_in or timedelta(days=7)),
    )
    if used:
        invite.accepted_at = datetime.now(UTC)
    if revoked:
        invite.revoked_at = datetime.now(UTC)
    db.add(invite)
    await db.flush()
    await db.commit()
    return org, invite


@pytest.mark.asyncio
async def test_create_org_existing_user_becomes_owner(async_client, session_factory):
    token = await _auth_token(async_client)
    async_client.cookies.set("access_token", f"Bearer {token}")

    response = await async_client.post("/app/orgs", json={"name": "Bluebird Studio"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Bluebird Studio"
    assert data["slug"] == "bluebird-studio"

    async with session_factory() as db:
        org = (
            (
                await db.execute(
                    select(Organization).where(Organization.slug == "bluebird-studio")
                )
            )
            .scalars()
            .one()
        )
        membership = (
            (await db.execute(select(Membership).where(Membership.org_id == org.id)))
            .scalars()
            .one()
        )
        assert membership.role == "owner"


@pytest.mark.asyncio
async def test_create_org_requires_auth(async_client):
    response = await async_client.post("/app/orgs", json={"name": "No Auth"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_org_rejects_extra_fields(async_client):
    token = await _auth_token(async_client)
    async_client.cookies.set("access_token", f"Bearer {token}")

    response = await async_client.post(
        "/app/orgs", json={"name": "X", "is_suspended": True}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


@pytest.mark.asyncio
async def test_invite_preview(async_client, session_factory):
    async with session_factory() as db:
        org, invite = await _seed_invite(db, role="admin")

    response = await async_client.get(f"/app/invites/{invite.token}")
    assert response.status_code == 200
    assert response.json() == {"org_name": org.name, "role": "admin"}


@pytest.mark.asyncio
async def test_invite_preview_invalid_404(async_client, session_factory):
    response = await async_client.get("/app/invites/nonexistent-token")
    assert response.status_code == 404
    assert response.json()["code"] == "invite_invalid"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kwargs",
    [
        {"expires_in": -timedelta(days=1)},
        {"used": True},
        {"revoked": True},
    ],
)
async def test_invite_preview_expired_used_revoked_404(
    async_client, session_factory, kwargs
):
    async with session_factory() as db:
        _, invite = await _seed_invite(db, **kwargs)

    response = await async_client.get(f"/app/invites/{invite.token}")
    assert response.status_code == 404
    assert response.json()["code"] == "invite_invalid"


@pytest.mark.asyncio
async def test_invite_accept_creates_membership(async_client, session_factory):
    async with session_factory() as db:
        org, invite = await _seed_invite(db, role="member")

    token = await _auth_token(async_client)
    async_client.cookies.set("access_token", f"Bearer {token}")

    response = await async_client.post(f"/app/invites/{invite.token}/accept")
    assert response.status_code == 201
    data = response.json()
    assert data["membership"]["org_id"] == str(org.id)
    assert data["membership"]["role"] == "member"

    # Invite is now used, so a second accept/preview is 404.
    assert (await async_client.get(f"/app/invites/{invite.token}")).status_code == 404
    assert (
        await async_client.post(f"/app/invites/{invite.token}/accept")
    ).status_code == 404


@pytest.mark.asyncio
async def test_invite_accept_requires_auth(async_client, session_factory):
    async with session_factory() as db:
        _, invite = await _seed_invite(db)

    response = await async_client.post(f"/app/invites/{invite.token}/accept")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_invite_accept_already_member_conflict(async_client, session_factory):
    async with session_factory() as db:
        org, invite = await _seed_invite(db)

    token = await _auth_token(async_client)
    async_client.cookies.set("access_token", f"Bearer {token}")

    # Join once, then try to accept a second invite to the SAME org.
    first = await async_client.post(f"/app/invites/{invite.token}/accept")
    assert first.status_code == 201

    async with session_factory() as db:
        _, second = await _seed_invite(db, org=org)

    response = await async_client.post(f"/app/invites/{second.token}/accept")
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


@pytest.mark.asyncio
async def test_owner_invite_rejected_by_database(session_factory):
    """An invite can never grant `owner` — the DB check constraint forbids it."""
    async with session_factory() as db:
        org, _ = await _seed_invite(db, role="member")
        owner_membership = (
            (await db.execute(select(Membership).where(Membership.org_id == org.id)))
            .scalars()
            .one()
        )

        bad = Invite(
            org_id=org.id,
            token=token_urlsafe(32),
            role="owner",
            created_by_membership_id=owner_membership.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.mark.asyncio
async def test_invite_accept_grants_invite_role_not_owner(
    async_client, session_factory
):
    """Accepting an invite grants exactly the invite's role, never owner."""
    async with session_factory() as db:
        org, invite = await _seed_invite(db, role="admin")

    token = await _auth_token(async_client)
    async_client.cookies.set("access_token", f"Bearer {token}")

    response = await async_client.post(f"/app/invites/{invite.token}/accept")
    assert response.status_code == 201
    assert response.json()["membership"]["role"] == "admin"

    async with session_factory() as db:
        membership = (
            (
                await db.execute(
                    select(Membership).where(
                        Membership.org_id == org.id, Membership.role == "owner"
                    )
                )
            )
            .scalars()
            .all()
        )
        # Only the seeded owner holds owner; the new member is an admin.
        assert len(membership) == 1


@pytest.mark.asyncio
async def test_double_accept_race_creates_one_membership(async_client, session_factory):
    """Two concurrent accepts of the same invite: exactly one succeeds."""
    async with session_factory() as db:
        org, invite = await _seed_invite(db)

    token = await _auth_token(async_client)
    async_client.cookies.set("access_token", f"Bearer {token}")

    responses = await asyncio.gather(
        async_client.post(f"/app/invites/{invite.token}/accept"),
        async_client.post(f"/app/invites/{invite.token}/accept"),
    )
    statuses = sorted(r.status_code for r in responses)
    assert statuses == [201, 404]

    async with session_factory() as db:
        count = (
            await db.execute(
                select(func.count())
                .select_from(Membership)
                .where(
                    Membership.org_id == org.id,
                    Membership.role != "owner",
                )
            )
        ).scalar()
        assert count == 1

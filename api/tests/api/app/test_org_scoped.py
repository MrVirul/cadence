"""Org-scoped behavior: cross-org 404s, suspension, role changes, last-owner
protection, invite lifecycle and the concurrent sign-up race.

Covers docs/API.md rules 4-7, 17, 25-27, 36, 41-42 and the permission-matrix
rows for members/invites (the per-route 404/403/owner checks live in
``test_tenancy_matrix.py``).
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe

import pytest
from faker import Faker
from sqlalchemy import func, select

from app.config import settings
from app.models import Invite, Membership, Organization, Plan, Team, TeamMember, User
from app.security import generate_jwt_token, hash_password

fake = Faker()

SIGNUP = "/app/auth/signup"
LOGIN = "/app/auth/login"


def _token(user) -> str:
    return generate_jwt_token({"sub": str(user.id)}, audience="app")


def _auth(token: str) -> dict[str, str]:
    return {"Access-Token": f"Bearer {token}"}


async def _seed_org(db, *role_specs: str, suspended: bool = False):
    """Seed an org with one user per role entry.

    Returns ``(org, [(role, user, membership), ...])`` preserving order, so
    duplicate roles (two owners) are distinguishable by index.
    """
    org = Organization(name=fake.company(), slug=f"os-{uuid.uuid4().hex[:12]}")
    if suspended:
        org.is_suspended = True
    db.add(org)
    await db.flush()
    members = []
    for role in role_specs:
        user = User(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=fake.email().lower(),
            password=hash_password("x"),
            is_active=True,
        )
        db.add(user)
        await db.flush()
        membership = Membership(org_id=org.id, user_id=user.id, role=role)
        db.add(membership)
        await db.flush()
        members.append((role, user, membership))
    await db.commit()
    return org, members


def _pick(members, role: str, index: int = 0):
    return [entry for entry in members if entry[0] == role][index]


@pytest.mark.asyncio
async def test_suspended_org_locks_members_and_reinstating_restores(
    async_client, session_factory
):
    """Rule 5-6: suspended org → 403 org_suspended on every route; reinstating
    restores access instantly. (Suspension flipped in the DB; the /internal
    suspend endpoint arrives in a later phase.)"""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, user, _ = _pick(members, "owner")
        org_id = org.id
    token = _token(user)

    async with session_factory() as db:
        org = await db.get(Organization, org_id)
        org.is_suspended = True
        org.suspended_at = datetime.now(UTC)
        await db.commit()

    for method, url, body in [
        ("GET", f"/app/orgs/{org_id}", None),
        ("PATCH", f"/app/orgs/{org_id}", {"name": "X"}),
        ("GET", f"/app/orgs/{org_id}/members", None),
    ]:
        response = await async_client.request(
            method, url, json=body, headers=_auth(token)
        )
        assert response.status_code == 403, (method, url)
        assert response.json()["code"] == "org_suspended"

    async with session_factory() as db:
        org = await db.get(Organization, org_id)
        org.is_suspended = False
        await db.commit()

    assert (
        await async_client.get(f"/app/orgs/{org_id}", headers=_auth(token))
    ).status_code == 200


@pytest.mark.asyncio
async def test_login_still_works_while_org_suspended(async_client, session_factory):
    """Rule 7: suspension blocks org routes, never login."""
    body = {
        "email": fake.email().lower(),
        "password": "longenough1",
        "name": "Suspended Owner",
        "org_name": "Susp Org",
    }
    signed = await async_client.post(SIGNUP, json=body)
    assert signed.status_code == 201
    org_id = uuid.UUID(signed.json()["membership"]["org_id"])

    async with session_factory() as db:
        org = await db.get(Organization, org_id)
        org.is_suspended = True
        await db.commit()

    login = await async_client.post(
        LOGIN, json={"email": body["email"], "password": body["password"]}
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_admin_cannot_touch_owners(async_client, session_factory):
    """Rule 25: an admin can never promote/demote/remove an owner — 403, and
    the owner's role is unchanged in the DB."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "admin", "member")
        _, _, owner_membership = _pick(members, "owner")
        _, admin_user, _ = _pick(members, "admin")
        owner_membership_id = owner_membership.id
    token = _token(admin_user)

    for body in ({"role": "member"}, {"role": "admin"}):
        response = await async_client.patch(
            f"/app/orgs/{org.id}/members/{owner_membership_id}",
            json=body,
            headers=_auth(token),
        )
        assert response.status_code == 403
        assert response.json()["code"] == "forbidden"

    response = await async_client.delete(
        f"/app/orgs/{org.id}/members/{owner_membership_id}", headers=_auth(token)
    )
    assert response.status_code == 403

    async with session_factory() as db:
        owner = await db.get(Membership, owner_membership_id)
        assert owner is not None and owner.role == "owner"


@pytest.mark.asyncio
async def test_admin_can_change_member_to_admin_and_back(async_client, session_factory):
    """Rule 26: an admin may reassign member↔admin."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "admin", "member")
        _, admin_user, _ = _pick(members, "admin")
        _, _, member_membership = _pick(members, "member")
    token = _token(admin_user)
    url = f"/app/orgs/{org.id}/members/{member_membership.id}"

    promoted = await async_client.patch(
        url, json={"role": "admin"}, headers=_auth(token)
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "admin"

    demoted = await async_client.patch(
        url, json={"role": "member"}, headers=_auth(token)
    )
    assert demoted.status_code == 200
    assert demoted.json()["role"] == "member"


@pytest.mark.asyncio
async def test_last_owner_cannot_be_demoted_or_removed(async_client, session_factory):
    """Rule 27: demoting/removing the last owner → 409 last_owner, unchanged."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, owner_user, owner_membership = _pick(members, "owner")
    token = _token(owner_user)
    url = f"/app/orgs/{org.id}/members/{owner_membership.id}"

    demote = await async_client.patch(
        url, json={"role": "member"}, headers=_auth(token)
    )
    assert demote.status_code == 409
    assert demote.json()["code"] == "last_owner"

    remove = await async_client.delete(url, headers=_auth(token))
    assert remove.status_code == 409
    assert remove.json()["code"] == "last_owner"

    async with session_factory() as db:
        owner = await db.get(Membership, owner_membership.id)
        assert owner is not None and owner.role == "owner"


@pytest.mark.asyncio
async def test_concurrent_demotions_of_different_owners_leave_one_owner(
    async_client, session_factory
):
    """Rule 36: two concurrent last-owner demotions — exactly one succeeds, the
    other gets 409 last_owner, and the org still has exactly one owner."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "owner")
        _, owner1_user, owner1_membership = _pick(members, "owner", 0)
        _, owner2_user, owner2_membership = _pick(members, "owner", 1)
        org_id = org.id

    responses = await asyncio.gather(
        async_client.patch(
            f"/app/orgs/{org_id}/members/{owner2_membership.id}",
            json={"role": "member"},
            headers=_auth(_token(owner1_user)),
        ),
        async_client.patch(
            f"/app/orgs/{org_id}/members/{owner1_membership.id}",
            json={"role": "member"},
            headers=_auth(_token(owner2_user)),
        ),
    )
    assert sorted(r.status_code for r in responses) in (
        [200, 409],
        [200, 403],
    ), [r.text for r in responses]

    async with session_factory() as db:
        count = (
            await db.execute(
                select(func.count())
                .select_from(Membership)
                .where(Membership.org_id == org_id, Membership.role == "owner")
            )
        ).scalar()
        assert count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        {"name": "X", "role": "owner"},
        {"name": "X", "org_id": "11111111-1111-1111-1111-111111111111"},
        {"name": "X", "membership_id": "11111111-1111-1111-1111-111111111111"},
        {"name": "X", "is_admin": True},
    ],
)
async def test_server_controlled_fields_rejected(async_client, session_factory, body):
    """Rule 17: role/org_id/membership_id/is_admin in a body → 422."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, owner_user, _ = _pick(members, "owner")

    response = await async_client.patch(
        f"/app/orgs/{org.id}", json=body, headers=_auth(_token(owner_user))
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


@pytest.mark.asyncio
async def test_invite_creation_rejects_owner_role_and_writes_nothing(
    async_client, session_factory
):
    """Rule 42: role=owner on an invite → 422, and no invite row is written."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, owner_user, _ = _pick(members, "owner")
        org_id = org.id

    response = await async_client.post(
        f"/app/orgs/{org_id}/invites",
        json={"role": "owner"},
        headers=_auth(_token(owner_user)),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"

    async with session_factory() as db:
        count = (
            await db.execute(
                select(func.count()).select_from(Invite).where(Invite.org_id == org_id)
            )
        ).scalar()
        assert count == 0


@pytest.mark.asyncio
async def test_only_valid_invites_are_listed(async_client, session_factory):
    """Rule 41: used/revoked/expired invites never appear in the list."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, _, owner_membership = _pick(members, "owner")
        org_id = org.id
        valid_token = None

        def add_invite(*, expired=False, used=False, revoked=False):
            nonlocal valid_token
            token = token_urlsafe(32)
            invite = Invite(
                org_id=org_id,
                token=token,
                role="member",
                created_by_membership_id=owner_membership.id,
                expires_at=datetime.now(UTC) + timedelta(days=7),
            )
            if expired:
                invite.expires_at = datetime.now(UTC) - timedelta(days=1)
            if used:
                invite.accepted_at = datetime.now(UTC)
            if revoked:
                invite.revoked_at = datetime.now(UTC)
            if not (expired or used or revoked):
                valid_token = token
            db.add(invite)
            return token

        add_invite()
        add_invite(expired=True)
        add_invite(used=True)
        add_invite(revoked=True)
        await db.commit()

    response = await async_client.get(
        f"/app/orgs/{org_id}/invites",
        headers=_auth(_token(_pick(members, "owner")[1])),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["token"] == valid_token


@pytest.mark.asyncio
async def test_invite_create_lists_and_revoke_lifecycle(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner")
        _, owner_user, _ = _pick(members, "owner")
        org_id = org.id
    token = _token(owner_user)
    headers = _auth(token)

    created = await async_client.post(
        f"/app/orgs/{org_id}/invites",
        json={"role": "admin", "expires_in_days": 3},
        headers=headers,
    )
    assert created.status_code == 201
    data = created.json()
    assert data["role"] == "admin"
    assert data["token"]
    assert data["url"] == f"{settings.APP_URL}/invite/{data['token']}"
    assert "expires_at" in data

    # The link works for preview and accept until revoked.
    assert (await async_client.get(f"/app/invites/{data['token']}")).status_code == 200

    revoked = await async_client.delete(
        f"/app/orgs/{org_id}/invites/{data['id']}", headers=headers
    )
    assert revoked.status_code == 204
    # Revoking is idempotent.
    assert (
        await async_client.delete(
            f"/app/orgs/{org_id}/invites/{data['id']}", headers=headers
        )
    ).status_code == 204
    assert (await async_client.get(f"/app/invites/{data['token']}")).status_code == 404


@pytest.mark.asyncio
async def test_revoke_invite_cross_org_404(async_client, session_factory):
    """A user from org B cannot revoke org A's invite (cross-org id → 404)."""
    async with session_factory() as db:
        org_a, members_a = await _seed_org(db, "owner")
        _, _, owner_a_membership = _pick(members_a, "owner")
        invite_a = Invite(
            org_id=org_a.id,
            token=token_urlsafe(32),
            role="member",
            created_by_membership_id=owner_a_membership.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(invite_a)
        org_b, members_b = await _seed_org(db, "owner")
        _, owner_b_user, _ = _pick(members_b, "owner")
        await db.commit()
        invite_a_id = invite_a.id

    response = await async_client.delete(
        f"/app/orgs/{org_b.id}/invites/{invite_a_id}",
        headers=_auth(_token(owner_b_user)),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"

    async with session_factory() as db:
        invite = await db.get(Invite, invite_a_id)
        assert invite is not None and invite.revoked_at is None


@pytest.mark.asyncio
async def test_members_list_shape_and_paging(async_client, session_factory):
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "admin", "member")
        _, admin_user, _ = _pick(members, "admin")
        org_id = org.id

    response = await async_client.get(
        f"/app/orgs/{org_id}/members", headers=_auth(_token(admin_user))
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert data["limit"] == 50 and data["offset"] == 0
    roles = {item["role"] for item in data["items"]}
    assert roles == {"owner", "admin", "member"}
    assert all(item["user"]["name"] and item["user"]["email"] for item in data["items"])

    paged = await async_client.get(
        f"/app/orgs/{org_id}/members?limit=2&offset=2",
        headers=_auth(_token(admin_user)),
    )
    assert paged.status_code == 200
    assert paged.json()["total"] == 3 and len(paged.json()["items"]) == 1


@pytest.mark.asyncio
async def test_member_removal_cascades_plans_teams_and_clears_lead(
    async_client, session_factory
):
    """Removing a member deletes their plans and team_members rows and clears
    their team lead links (documented in DATA_MODEL.md)."""
    async with session_factory() as db:
        org, members = await _seed_org(db, "owner", "member")
        _, owner_user, _ = _pick(members, "owner", 0)
        _, _, victim_membership = _pick(members, "member", 0)
        monday = datetime.now(UTC).date() - timedelta(
            days=datetime.now(UTC).date().weekday()
        )
        team = Team(
            org_id=org.id, name="Platform", lead_membership_id=victim_membership.id
        )
        db.add(team)
        await db.flush()
        db.add(
            TeamMember(
                org_id=org.id, team_id=team.id, membership_id=victim_membership.id
            )
        )
        db.add(
            Plan(
                org_id=org.id,
                membership_id=victim_membership.id,
                team_id=team.id,
                week_start=monday,
            )
        )
        await db.commit()
        victim_id = victim_membership.id
        team_id = team.id
        org_id = org.id

    response = await async_client.delete(
        f"/app/orgs/{org_id}/members/{victim_id}",
        headers=_auth(_token(owner_user)),
    )
    assert response.status_code == 204

    async with session_factory() as db:
        assert await db.get(Membership, victim_id) is None
        team_member_count = (
            await db.execute(
                select(func.count())
                .select_from(TeamMember)
                .where(TeamMember.membership_id == victim_id)
            )
        ).scalar()
        plan_count = (
            await db.execute(
                select(func.count())
                .select_from(Plan)
                .where(Plan.membership_id == victim_id)
            )
        ).scalar()
        team = (
            (await db.execute(select(Team).where(Team.id == team_id))).scalars().one()
        )
        assert team_member_count == 0
        assert plan_count == 0
        assert team.lead_membership_id is None


@pytest.mark.asyncio
async def test_two_concurrent_signups_same_email_one_succeeds(
    async_client, session_factory
):
    """Rule 37 sibling for sign-up: exactly one 201, the other 409 (never 500)."""
    body = {
        "email": fake.email().lower(),
        "password": "longenough1",
        "name": "Race",
        "org_name": "Race Org",
    }
    responses = await asyncio.gather(
        async_client.post(SIGNUP, json=body),
        async_client.post(SIGNUP, json=body),
    )
    assert sorted(r.status_code for r in responses) == [201, 409], [
        r.json() for r in responses
    ]
    loser = next(r for r in responses if r.status_code == 409)
    assert loser.json()["code"] == "conflict"

    async with session_factory() as db:
        count = (
            await db.execute(
                select(func.count())
                .select_from(User)
                .where(User.email == body["email"])
            )
        ).scalar()
        assert count == 1

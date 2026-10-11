"""Auth & sign-up flows: /app/auth/signup, /app/auth/login, /app/auth/logout,
/app/me, deactivation, and token-surface isolation.

Error body shape everywhere is {"detail": str, "code": "snake_case"}.
"""

from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe

import pytest
from faker import Faker
from sqlalchemy import func, select

from app.models import Invite, Membership, Organization, User
from app.security import JWT_AUDIENCE_INTERNAL, generate_jwt_token, hash_password

fake = Faker()

SIGNUP = "/app/auth/signup"
LOGIN = "/app/auth/login"
ME = "/app/me"


def _signup_body(**overrides) -> dict:
    body = {
        "email": fake.email().lower(),
        "password": "longenough1",
        "name": "Ada Lovelace",
        "org_name": "Northwind Labs",
    }
    body.update(overrides)
    return body


async def _auth_client_cookie(client, token: str) -> None:
    client.cookies.set("access_token", f"Bearer {token}")


async def _seed_org_with_invite(db, *, role: str = "member"):
    """Create an org with an owner and a pending invite; returns (org, token)."""
    org = Organization(name="Invite Org", slug=f"inv-{fake.uuid4()[:10]}")
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

    token = token_urlsafe(32)
    invite = Invite(
        org_id=org.id,
        token=token,
        role=role,
        created_by_membership_id=membership.id,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invite)
    await db.flush()
    await db.commit()
    return org, token


@pytest.mark.asyncio
async def test_signup_with_org_creates_owner_membership(async_client, session_factory):
    """Sign-up with org_name creates the org and makes the user owner."""
    body = _signup_body()
    response = await async_client.post(SIGNUP, json=body)

    assert response.status_code == 201
    data = response.json()
    assert data["access_token"]
    assert data["user"]["email"] == body["email"]
    assert data["user"]["first_name"] == "Ada"
    assert data["user"]["last_name"] == "Lovelace"
    assert data["membership"]["org_name"] == "Northwind Labs"
    assert data["membership"]["role"] == "owner"

    async with session_factory() as db:
        user = (
            (await db.execute(select(User).where(User.email == body["email"])))
            .scalars()
            .one()
        )
        # Sign-up always creates an active, non-staff user.
        assert user.is_active is True
        assert user.is_admin is False
        membership = (
            (await db.execute(select(Membership).where(Membership.user_id == user.id)))
            .scalars()
            .one()
        )
        assert membership.role == "owner"


@pytest.mark.asyncio
async def test_signup_derives_name_from_email(async_client):
    """`name` is optional; the email local-part fills first_name."""
    body = _signup_body(name=None)
    response = await async_client.post(SIGNUP, json=body)

    assert response.status_code == 201
    data = response.json()
    assert data["user"]["first_name"] == body["email"].split("@")[0]
    assert data["user"]["last_name"] == ""


@pytest.mark.asyncio
async def test_signup_with_invite_grants_invite_role(async_client, session_factory):
    """Accept an invite at sign-up and the membership carries the invite role."""
    async with session_factory() as db:
        org, token = await _seed_org_with_invite(db, role="admin")

    response = await async_client.post(
        SIGNUP, json=_signup_body(invite_token=token, org_name=None)
    )

    assert response.status_code == 201
    data = response.json()
    assert data["membership"]["org_id"] == str(org.id)
    assert data["membership"]["role"] == "admin"

    async with session_factory() as db:
        user = (
            (await db.execute(select(User).where(User.email == data["user"]["email"])))
            .scalars()
            .one()
        )
        membership = (
            (await db.execute(select(Membership).where(Membership.user_id == user.id)))
            .scalars()
            .one()
        )
        assert membership.role == "admin"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        _signup_body(org_name="X", invite_token="sometoken"),
        _signup_body(org_name=None, invite_token=None),
    ],
)
async def test_signup_requires_exactly_one_target(async_client, body):
    """Both or neither of org_name/invite_token → 422 validation_error."""
    response = await async_client.post(SIGNUP, json=body)

    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "validation_error"
    assert isinstance(data["detail"], str) and data["detail"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "extra",
    [
        {"is_admin": True},
        {"role": "owner"},
        {"org_id": "00000000-0000-0000-0000-000000000000"},
    ],
)
async def test_signup_rejects_server_controlled_fields(async_client, extra):
    """`is_admin` / `role` / `org_id` in the body are rejected, never accepted."""
    body = _signup_body(**extra)
    response = await async_client.post(SIGNUP, json=body)

    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "validation_error"
    assert next(iter(extra)) in data["detail"]


@pytest.mark.asyncio
async def test_signup_duplicate_email_conflict(async_client):
    """A second sign-up with the same email → 409 conflict."""
    body = _signup_body()
    first = await async_client.post(SIGNUP, json=body)
    assert first.status_code == 201

    second = await async_client.post(SIGNUP, json=body)
    assert second.status_code == 409
    assert second.json()["code"] == "conflict"


@pytest.mark.asyncio
async def test_signup_weak_password_rejected(async_client):
    response = await async_client.post(SIGNUP, json=_signup_body(password="short"))
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


@pytest.mark.asyncio
async def test_signup_with_invalid_invite_writes_nothing(async_client, session_factory):
    """An invalid invite at sign-up → 404 and no user is created."""
    async with session_factory() as db:
        before = (await db.execute(select(func.count()).select_from(User))).scalar()

    response = await async_client.post(
        SIGNUP, json=_signup_body(invite_token="does-not-exist", org_name=None)
    )
    assert response.status_code == 404
    assert response.json()["code"] == "invite_invalid"

    async with session_factory() as db:
        after = (await db.execute(select(func.count()).select_from(User))).scalar()
    assert after == before  # nothing was written


@pytest.mark.asyncio
async def test_login_after_signup(async_client):
    body = _signup_body()
    assert (await async_client.post(SIGNUP, json=body)).status_code == 201

    response = await async_client.post(
        LOGIN, json={"email": body["email"], "password": body["password"]}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_errors_are_identical_and_generic(async_client, session_factory):
    """Wrong password and a deactivated user produce the SAME 401 body."""
    email_active = fake.email().lower()
    email_inactive = fake.email().lower()
    password = "sometestpass1"

    async with session_factory() as db:
        db.add_all(
            [
                User(
                    first_name="A",
                    last_name="A",
                    email=email_active,
                    password=hash_password(password),
                    is_active=True,
                ),
                User(
                    first_name="B",
                    last_name="B",
                    email=email_inactive,
                    password=hash_password(password),
                    is_active=False,
                ),
            ]
        )
        await db.commit()

    wrong_pw = await async_client.post(
        LOGIN, json={"email": email_active, "password": "wrongpassword1"}
    )
    deactivated = await async_client.post(
        LOGIN, json={"email": email_inactive, "password": password}
    )

    assert wrong_pw.status_code == deactivated.status_code == 401
    assert wrong_pw.json() == deactivated.json()
    assert wrong_pw.json()["code"] == "unauthorized"

    # Unknown email gets the identical body too (no user enumeration).
    unknown = await async_client.post(
        LOGIN, json={"email": fake.email(), "password": password}
    )
    assert unknown.status_code == 401
    assert unknown.json() == wrong_pw.json()


@pytest.mark.asyncio
async def test_old_token_stops_working_after_deactivation(
    async_client, session_factory
):
    """A token minted before deactivation is rejected on the next request."""
    email = fake.email().lower()
    password = "sometestpass1"
    async with session_factory() as db:
        user = User(
            first_name="C",
            last_name="C",
            email=email,
            password=hash_password(password),
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        user_id = user.id

    token = generate_jwt_token({"sub": str(user_id)}, audience="app")
    await _auth_client_cookie(async_client, token)
    assert (await async_client.get(ME)).status_code == 200

    async with session_factory() as db:
        user = await db.get(User, user_id)
        user.is_active = False
        await db.commit()

    response = await async_client.get(ME)
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


@pytest.mark.asyncio
async def test_me_lists_memberships(async_client):
    body = _signup_body()
    signed = await async_client.post(SIGNUP, json=body)
    token = signed.json()["access_token"]
    await _auth_client_cookie(async_client, token)

    response = await async_client.get(ME)
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == body["email"]
    assert len(data["memberships"]) == 1
    membership = data["memberships"][0]
    assert membership["org"]["name"] == "Northwind Labs"
    assert membership["role"] == "owner"
    assert membership["org"]["slug"]


@pytest.mark.asyncio
async def test_me_requires_auth(async_client):
    response = await async_client.get(ME)
    assert response.status_code == 401
    assert response.json() == {
        "detail": "Credentials required from cookie or access token",
        "code": "credentials_required",
    }


@pytest.mark.asyncio
async def test_logout(async_client):
    response = await async_client.post("/app/auth/logout")
    assert response.status_code == 200
    assert response.json()["message"] == "Successfully logged out"


@pytest.mark.asyncio
async def test_customer_token_rejected_on_internal(async_client, session_factory):
    """An app token must never authenticate against /internal (wrong audience)."""
    body = _signup_body()
    token = (await async_client.post(SIGNUP, json=body)).json()["access_token"]

    response = await async_client.get(
        "/internal/users/self", headers={"Access-Token": f"Bearer {token}"}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


@pytest.mark.asyncio
async def test_staff_token_rejected_on_app_me(async_client, session_factory):
    """A staff (internal-audience) token must not work on /app."""
    async with session_factory() as db:
        staff = User(
            first_name="Staff",
            last_name="User",
            email=fake.email().lower(),
            password=hash_password("x"),
            is_active=True,
            is_admin=True,
        )
        db.add(staff)
        await db.commit()
        await db.refresh(staff)
        staff_id = staff.id

    token = generate_jwt_token({"sub": str(staff_id)}, audience=JWT_AUDIENCE_INTERNAL)
    response = await async_client.get(ME, headers={"Access-Token": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"

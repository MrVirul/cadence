from typing import cast

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.app.access import CurrentUser
from app.api.app.schemas import (
    AuthRequest,
    AuthResponse,
    MeMembership,
    MeResponse,
    OrgResponse,
    OrgRole,
    SignupMembership,
    SignupRequest,
    SignupResponse,
    UserResponse,
)
from app.config import settings
from app.database import DBSession
from app.exceptions import APIException
from app.models import User
from app.schemas import MessageResponse
from app.security import JWT_AUDIENCE_APP, generate_jwt_token, verify_password
from app.services.auth import AuthService
from app.services.memberships import MembershipService

router = APIRouter()

COOKIE_NAME = "access_token"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=f"Bearer {token}",
        samesite="lax",
        secure=settings.SECURE_COOKIE,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/auth/signup", status_code=status.HTTP_201_CREATED, tags=["auth"])
async def signup(
    data: SignupRequest, session: DBSession, response: Response
) -> SignupResponse:
    user, org, membership = await AuthService(session).signup(
        email=str(data.email),
        password=data.password,
        name=data.name,
        org_name=data.org_name,
        invite_token=data.invite_token,
    )
    # Router commits once; any failure above rolls the whole transaction back.
    await session.commit()

    access_token = generate_jwt_token({"sub": str(user.id)}, audience=JWT_AUDIENCE_APP)
    _set_session_cookie(response, access_token)

    return SignupResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
        membership=SignupMembership(
            org_id=org.id,
            org_name=org.name,
            role=cast(OrgRole, membership.role),
        ),
    )


@router.post("/auth/login", tags=["auth"])
async def login(
    auth_request: AuthRequest, session: DBSession, response: Response
) -> AuthResponse:
    # Generic on every failure path so the login endpoint never reveals whether
    # an email exists (docs/API.md — no user enumeration).
    result = await session.execute(
        select(User).where(User.email == str(auth_request.email).lower())
    )
    user = result.scalars().first()
    if (
        user is None
        or not user.is_active
        or user.password is None
        or not verify_password(auth_request.password, user.password)
    ):
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="unauthorized",
            message="Incorrect email or password",
        )

    access_token = generate_jwt_token({"sub": str(user.id)}, audience=JWT_AUDIENCE_APP)
    _set_session_cookie(response, access_token)
    return AuthResponse(access_token=access_token)


@router.post("/auth/logout", tags=["auth"])
async def logout(response: Response) -> MessageResponse:
    response.delete_cookie(COOKIE_NAME)
    return MessageResponse(message="Successfully logged out")


@router.get("/me", tags=["auth"])
async def me(current_user: CurrentUser, session: DBSession) -> MeResponse:
    memberships = await MembershipService(session).list_with_orgs(current_user.id)
    return MeResponse(
        user=UserResponse.model_validate(current_user),
        memberships=[
            MeMembership(
                org=OrgResponse.model_validate(org),
                role=cast(OrgRole, membership.role),
            )
            for membership, org in memberships
        ],
    )

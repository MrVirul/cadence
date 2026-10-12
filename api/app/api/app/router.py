from fastapi.routing import APIRouter

from .routers import auth, invites, members, meta, orgs

router = APIRouter()

router.include_router(meta.router)
router.include_router(auth.router)
router.include_router(orgs.router)
router.include_router(members.router)
router.include_router(invites.router)

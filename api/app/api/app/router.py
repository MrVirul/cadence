from fastapi.routing import APIRouter

from .routers import ai, auth, invites, members, meta, orgs, plans, teams

router = APIRouter()

router.include_router(meta.router)
router.include_router(auth.router)
router.include_router(orgs.router)
router.include_router(members.router)
router.include_router(invites.router)
router.include_router(teams.router)
router.include_router(plans.router)
router.include_router(ai.router)

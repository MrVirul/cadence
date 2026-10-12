import os

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles

from app.api.app.router import router as app_router
from app.api.internal.router import router as internal_router
from app.config import settings
from app.exceptions import (
    APIException,
    api_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)


def route_operation_id(route: APIRoute) -> str:
    # Use the endpoint function name as the operationId instead of FastAPI's
    # default "{name}_{path}_{method}". This keeps the generated frontend client
    # readable (e.g. useGetCurrentUser instead of useGetCurrentUserUsersMeGet).
    # Endpoint function names within each sub-app are unique, so no collisions.
    return route.name


# The OpenAPI schema and the interactive docs it powers expose the full API
# surface, so they are served everywhere except production. Passed to every app
# below: the mounted sub-apps serve their own docs, independently of the root.
openapi_url = None if settings.is_production else "/openapi.json"
docs_url = None if settings.is_production else "/docs"
redoc_url = None if settings.is_production else "/redoc"

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=openapi_url,
    docs_url=docs_url,
    redoc_url=redoc_url,
)

app_api = FastAPI(
    contact={"name": "Chamoda Pandithage", "email": "chamoda@xaventra.com"},
    description="App api endpoints",
    generate_unique_id_function=route_operation_id,
    openapi_tags=[
        {"name": "meta", "description": "Health and service metadata"},
        {"name": "auth", "description": "Authentication and session"},
        {"name": "orgs", "description": "Organizations"},
        {"name": "members", "description": "Organization members"},
        {"name": "invites", "description": "Invites"},
        {"name": "teams", "description": "Teams and team leads"},
        {"name": "plans", "description": "Weekly plans and the plan state machine"},
        {"name": "tasks", "description": "Plan tasks"},
        {"name": "ai", "description": "AI plan review and draft-from-notes"},
    ],
    openapi_url=openapi_url,
    docs_url=docs_url,
    redoc_url=redoc_url,
)


app_api.include_router(app_router)
app_api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/app", app_api, "app")


internal_api = FastAPI(
    contact={"name": "Chamoda Pandithage", "email": "chamoda@xaventra.com"},
    description="Internal api endpoints",
    generate_unique_id_function=route_operation_id,
    openapi_tags=[
        {"name": "meta", "description": "Health and service metadata"},
        {"name": "auth", "description": "Authentication and session"},
        {"name": "orgs", "description": "Organizations (metadata and counts)"},
        {"name": "users", "description": "User endpoints"},
        {"name": "ai-usage", "description": "AI usage metrics"},
        {"name": "audit", "description": "Staff action audit log"},
    ],
    openapi_url=openapi_url,
    docs_url=docs_url,
    redoc_url=redoc_url,
)


# Every error — custom, validation, or unexpected — uses one JSON body:
# {"detail": <string>, "code": <snake_case>}. Registered on both sub-apps via
# the decorator form, which registers under the hood but lets handlers keep
# their precise exception types.
for api in (app_api, internal_api):
    api.exception_handler(APIException)(api_exception_handler)
    api.exception_handler(RequestValidationError)(validation_exception_handler)
    api.exception_handler(Exception)(unhandled_exception_handler)


internal_api.include_router(internal_router)
internal_api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/internal", internal_api, "internal")


obj_dir = os.path.join(os.getcwd(), "obj")
if os.path.exists(obj_dir):
    app.mount("/obj", StaticFiles(directory="obj"), name="obj")

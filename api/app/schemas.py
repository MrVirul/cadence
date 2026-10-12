from datetime import UTC
from typing import Annotated

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    WrapSerializer,
)

DateTime = Annotated[
    AwareDatetime,
    WrapSerializer(
        lambda v, nxt: nxt(v.astimezone(UTC)).replace("+00:00", "Z"),
        when_used="json",
    ),
]


class Model(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, from_attributes=True)


class MessageResponse(Model):
    message: str


class PageResponse[T](Model):
    """Pagination envelope shared by list endpoints (docs/API.md conventions)."""

    items: list[T]
    total: int
    limit: int
    offset: int


class HealthCheckResponse(Model):
    status: str  # "healthy" or "unhealthy"

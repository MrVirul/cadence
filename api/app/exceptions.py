from collections.abc import Iterable, Mapping
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.logging import logger


class APIException(HTTPException):
    """Error rendered as ``{"detail": str, "code": "snake_case"}``.

    One shape for every error (brief §6, ``docs/API.md``): ``detail`` is a
    human-readable string and ``code`` is a stable snake_case token the frontend
    can switch on. ``headers`` carries extras such as ``Retry-After`` on a 429.
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.headers = headers
        super().__init__(status_code=status_code, detail=message, headers=headers)

    def to_response(self) -> JSONResponse:
        return JSONResponse(
            status_code=self.status_code,
            content={"detail": self.message, "code": self.code},
            headers=self.headers,
        )


def format_validation_errors(errors: Iterable[Mapping[str, Any]]) -> str:
    """Fold FastAPI's list of field errors into a single ``detail`` string.

    ``loc`` is stripped of the leading ``"body"`` tag and joined with dots, so
    ``{"loc": ["body", "is_admin"]}`` becomes ``"is_admin: Extra inputs are not
    permitted"``. Errors without a field (model validators, malformed JSON) keep
    just their message.
    """
    parts: list[str] = []
    for error in errors:
        location = [str(part) for part in error.get("loc", ()) if part != "body"]
        message = str(error.get("msg", "Invalid value"))
        parts.append(f"{'.'.join(location)}: {message}" if location else message)
    return "; ".join(parts) or "Invalid request"


async def api_exception_handler(_request: Request, exc: APIException) -> JSONResponse:
    return exc.to_response()


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "detail": format_validation_errors(exc.errors()),
            "code": "validation_error",
        },
    )


async def unhandled_exception_handler(
    _request: Request, exc: Exception
) -> JSONResponse:
    # Log the traceback internally but never expose it to the caller.
    logger.exception("Unhandled server error", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "code": "internal_error"},
    )


class ResourceNotFoundException(APIException):
    def __init__(self, message: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code="not_found",
            message=message,
        )


class ConflictException(APIException):
    def __init__(self, message: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            code="conflict",
            message=message,
        )


class OrgSuspendedException(APIException):
    def __init__(self) -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            code="org_suspended",
            message="This organization is suspended. Contact support to restore access.",
        )


class ForbiddenException(APIException):
    """Authenticated but not permitted, with a specific reason (403 forbidden)."""

    def __init__(self, message: str) -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            code="forbidden",
            message=message,
        )


class RoleForbiddenException(ForbiddenException):
    def __init__(self) -> None:
        super().__init__("You do not have permission to perform this action")


class ValidationException(APIException):
    """A business-rule rejection that is not a Pydantic schema error.

    Uses the same ``422 validation_error`` body as schema validation so callers
    switch on one code (docs/API.md conventions).
    """

    def __init__(self, message: str = "Invalid request"):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="validation_error",
            message=message,
        )


class InvalidTransitionException(APIException):
    """The plan state machine rejects the requested action (docs/DATA_MODEL.md)."""

    def __init__(
        self, message: str = "That action is not allowed from the plan's current state"
    ) -> None:
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            code="invalid_transition",
            message=message,
        )


class LastOwnerException(APIException):
    def __init__(self) -> None:
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            code="last_owner",
            message="An organization must always have at least one owner",
        )


class AiUnavailableException(APIException):
    """No API key configured: the AI features are disabled, planning still works."""

    def __init__(self) -> None:
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="ai_unavailable",
            message=(
                "The AI review is not configured on this server. "
                "You can keep planning and submit without a review."
            ),
        )


class AiRateLimitedException(APIException):
    """Local or upstream rate limit; carries `Retry-After` (docs/API.md)."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            code="ai_rate_limited",
            message=(
                "The AI review is rate limited right now. Your plan is safe. "
                "You can submit without a review, or try again in a minute."
            ),
            headers={"Retry-After": str(retry_after)},
        )


class AiTimeoutException(APIException):
    def __init__(self) -> None:
        super().__init__(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            code="ai_timeout",
            message=(
                "The AI review took too long and timed out. "
                "Try again, or keep planning without a review."
            ),
        )


class AiBadOutputException(APIException):
    """The model returned output that failed validation after retries."""

    def __init__(self) -> None:
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            code="ai_bad_output",
            message=(
                "The AI returned an unreadable review. "
                "Try again, or keep planning without a review."
            ),
        )


class AiErrorException(APIException):
    """Any other AI failure; provider messages and the API key are never leaked."""

    def __init__(self) -> None:
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            code="ai_error",
            message=(
                "The AI review failed. Try again, or keep planning without a review."
            ),
        )

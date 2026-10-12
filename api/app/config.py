from typing import Literal

import email_validator
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_ignore_empty=True, extra="ignore"
    )

    PROJECT_NAME: str = "app"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    LOG_LEVEL: str = "DEBUG"
    SECRET_KEY: str = ""
    SQLALCHEMY_DATABASE_URI: str = ""
    SQLALCHEMY_ECHO: bool = False
    SECURE_COOKIE: bool = True

    CORS_ORIGINS: str = "http://localhost:3000"

    # Public URL of the customer app; used to build invite links returned by the
    # API (e.g. `{APP_URL}/invite/{token}`).
    APP_URL: str = "http://localhost:3001"

    # Pydantic AI / Google Gemini (plan review + draft-from-notes). Read ONLY on
    # the server; the key is never returned by an endpoint and never logged.
    # Empty key => the AI features are disabled and return 503 (planning still
    # works). See `app/ai/`.
    GOOGLE_API_KEY: str = ""
    AI_MODEL: str = "gemini-3.5-flash-lite"
    AI_TIMEOUT_SECONDS: float = 20
    AI_LIMIT_PER_USER_PER_MINUTE: int = 6
    AI_LIMIT_PER_ORG_PER_DAY: int = 150

    # JWT Token settings
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    JWT_ALGORITHM: str = "HS256"

    # Cloudflare API token for SSL certificates
    CLOUDFLARE_API_TOKEN: str | None = None

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v):
        if not v or not v.strip():
            raise ValueError(
                "SECRET_KEY cannot be empty. Set SECRET_KEY environment variable."
            )
        return v

    @field_validator("SQLALCHEMY_DATABASE_URI")
    @classmethod
    def validate_database_uri(cls, v):
        if not v or not v.strip():
            raise ValueError(
                "SQLALCHEMY_DATABASE_URI cannot be empty. Set SQLALCHEMY_DATABASE_URI environment variable."
            )
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


settings = Settings()

# Demo accounts use the reserved `.test` TLD (root AGENTS.md §10), which is a
# valid special-use domain but `email-validator` rejects unless test mode is on.
# Enable it so demo logins work; this is not production, so keep the check
# strict only in production.
email_validator.TEST_ENVIRONMENT = not settings.is_production

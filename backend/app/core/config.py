"""Central application configuration.

All environment access for the backend goes through this module so that
defaults and validation live in one place.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")


def _as_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _as_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc


def _as_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


class Settings:
    """Immutable-ish view of the process environment."""

    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_URL", "")
        self.jwt_secret_key = os.getenv("JWT_SECRET_KEY", "")
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = _as_int("ACCESS_TOKEN_EXPIRE_MINUTES", 60)
        self.cookie_name = os.getenv("SESSION_COOKIE_NAME", "cognivault_access_token")
        self.cookie_secure = _as_bool("COOKIE_SECURE", False)
        self.cookie_domain = os.getenv("COOKIE_DOMAIN") or None
        self.frontend_origins = _as_list(
            "FRONTEND_ORIGINS",
            ["http://localhost:3000", "http://127.0.0.1:3000"],
        )
        self.upload_dir = Path(
            os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "uploads"))
        ).resolve()
        self.max_file_size = _as_int("MAX_FILE_SIZE_MB", 10) * 1024 * 1024
        self.max_pdf_pages = _as_int("MAX_PDF_PAGES", 20)
        self.rag_max_distance = float(os.getenv("RAG_MAX_DISTANCE", "0.75"))
        self.groq_api_key = os.getenv("GROQ_API_KEY", "")
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.google_api_key = os.getenv("GOOGLE_API_KEY", "")
        self.groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
        self.tavily_api_key = os.getenv("TAVILY_API_KEY", "")
        self.tesseract_cmd = os.getenv("TESSERACT_CMD", "")
        self.login_rate_limit = _as_int("LOGIN_RATE_LIMIT", 5)
        self.login_rate_window_seconds = _as_int("LOGIN_RATE_WINDOW_SECONDS", 900)
        # Custom-agent runtime limits are deliberately bounded again in
        # validate(); environment configuration must not disable safeguards.
        self.custom_agent_max_message_length = _as_int(
            "CUSTOM_AGENT_MAX_MESSAGE_LENGTH", 4000
        )
        self.custom_agent_max_documents = _as_int("CUSTOM_AGENT_MAX_DOCUMENTS", 20)
        self.custom_agent_execution_timeout_seconds = _as_int(
            "CUSTOM_AGENT_EXECUTION_TIMEOUT_SECONDS", 90
        )
        self.custom_agent_recursion_limit = _as_int("CUSTOM_AGENT_RECURSION_LIMIT", 16)
        self.custom_agent_max_concurrency = _as_int("CUSTOM_AGENT_MAX_CONCURRENCY", 4)
        self.custom_agent_context_max_messages = _as_int(
            "CUSTOM_AGENT_CONTEXT_MAX_MESSAGES", 24
        )
        self.custom_agent_context_max_chars = _as_int(
            "CUSTOM_AGENT_CONTEXT_MAX_CHARS", 32_000
        )
        self.is_production = _as_bool("PRODUCTION", False)

    def validate(self) -> None:
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is not configured")
        if len(self.jwt_secret_key) < 32:
            raise RuntimeError("JWT_SECRET_KEY must be at least 32 characters.")
        if self.is_production and not self.cookie_secure:
            raise RuntimeError("COOKIE_SECURE must be true when PRODUCTION=true.")
        limits = (
            (
                "CUSTOM_AGENT_MAX_MESSAGE_LENGTH",
                self.custom_agent_max_message_length,
                1,
                10_000,
            ),
            ("CUSTOM_AGENT_MAX_DOCUMENTS", self.custom_agent_max_documents, 0, 20),
            (
                "CUSTOM_AGENT_EXECUTION_TIMEOUT_SECONDS",
                self.custom_agent_execution_timeout_seconds,
                1,
                600,
            ),
            ("CUSTOM_AGENT_RECURSION_LIMIT", self.custom_agent_recursion_limit, 2, 100),
            ("CUSTOM_AGENT_MAX_CONCURRENCY", self.custom_agent_max_concurrency, 1, 16),
            (
                "CUSTOM_AGENT_CONTEXT_MAX_MESSAGES",
                self.custom_agent_context_max_messages,
                2,
                100,
            ),
            (
                "CUSTOM_AGENT_CONTEXT_MAX_CHARS",
                self.custom_agent_context_max_chars,
                4_000,
                200_000,
            ),
        )
        for name, value, minimum, maximum in limits:
            if not minimum <= value <= maximum:
                raise RuntimeError(f"{name} must be between {minimum} and {maximum}.")


settings = Settings()

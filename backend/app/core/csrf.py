"""Origin-based CSRF protection for cookie-authenticated mutations."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

ALLOWED_ORIGINS = set(settings.frontend_origins) | {
    "http://127.0.0.1:8000",
    "http://localhost:8000",
}


def _origin_of(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


async def csrf_origin_middleware(request: Request, call_next):
    if request.method in SAFE_METHODS:
        return await call_next(request)

    origin = _origin_of(request.headers.get("origin"))

    # Fall back to Referer only when Origin is absent (older browsers).
    if origin is None:
        origin = _origin_of(request.headers.get("referer"))

    if origin not in ALLOWED_ORIGINS:
        return JSONResponse(
            status_code=403,
            content={"detail": "Invalid or missing request Origin"},
        )

    # Modern browsers tell us whether the request is cross-site. Reject
    # explicit cross-site writes even if an Origin header was forged.
    fetch_site = request.headers.get("sec-fetch-site")
    if fetch_site == "cross-site":
        return JSONResponse(
            status_code=403,
            content={"detail": "Cross-site request blocked"},
        )

    return await call_next(request)

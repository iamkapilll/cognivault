"""Authentication dependencies shared by protected routers."""

from __future__ import annotations

from datetime import UTC, datetime

import jwt
from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import COOKIE_NAME, decode_access_token
from app.database import get_db
from app.models import AuthSession, User


def unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Cookie"},
    )


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")

    if forwarded:
        return forwarded.split(",")[0].strip()

    return request.client.host if request.client else "unknown"


def get_current_user(
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise unauthorized()

    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
        jti = str(payload["jti"])
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        # Never echo the decoder error to the client.
        raise unauthorized() from None

    session = db.scalar(select(AuthSession).where(AuthSession.jti == jti))

    if session is None or session.revoked_at is not None:
        raise unauthorized("Session is no longer valid")

    if session.user_id != user_id:
        raise unauthorized()

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at <= datetime.now(UTC):
        raise unauthorized("Session expired")

    user = db.get(User, user_id)

    if user is None or not user.is_active:
        raise unauthorized()

    return user

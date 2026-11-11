"""Password hashing, JWT creation/validation and session identifiers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import PwdlibError

from app.core.config import settings

password_hash = PasswordHash.recommended()

ALGORITHM = settings.jwt_algorithm
COOKIE_NAME = settings.cookie_name

COMMON_PASSWORDS = {
    "password1234",
    "passwordpassword",
    "123456789012",
    "qwertyqwerty",
    "letmeinletmein",
    "adminadminadmin",
}


def get_secret_key() -> str:
    secret = settings.jwt_secret_key

    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET_KEY must be at least 32 characters.")

    return secret


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return password_hash.verify(plain_password, hashed_password)
    except (PwdlibError, ValueError):
        # A corrupted or legacy hash must never authenticate a request.
        return False


def validate_password_strength(password: str) -> str | None:
    """Return an error message, or None when the password is acceptable."""

    if len(password) < 12:
        return "Password must be at least 12 characters long."
    if len(password) > 128:
        return "Password must be at most 128 characters long."
    if not password.strip():
        return "Password cannot be only whitespace."
    if not any(character.isalpha() for character in password):
        return "Password must contain at least one letter."
    if not any(character.isdigit() for character in password):
        return "Password must contain at least one number."
    if password.lower() in COMMON_PASSWORDS:
        return "That password is too common. Choose a stronger one."
    return None


def create_access_token(
    user_id: int,
    *,
    jti: str | None = None,
    expires_minutes: int | None = None,
) -> str:
    now = datetime.now(UTC)
    ttl = expires_minutes or settings.access_token_expire_minutes
    expires = now + timedelta(minutes=ttl)

    payload = {
        "sub": str(user_id),
        "jti": jti or uuid4().hex,
        "iat": now,
        "exp": expires,
        "type": "access",
    }

    return jwt.encode(payload, get_secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(
        token,
        get_secret_key(),
        algorithms=[ALGORITHM],
        options={"require": ["sub", "jti", "iat", "exp"]},
    )

    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Invalid token type")

    return payload

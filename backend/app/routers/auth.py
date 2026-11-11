"""Registration, login, logout and current-user endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_client_ip, get_current_user
from app.core.rate_limit import SlidingWindowLimiter
from app.core.security import (
    COOKIE_NAME,
    create_access_token,
    decode_access_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.database import get_db
from app.models import AuthSession, User

router = APIRouter(prefix="/auth", tags=["Authentication"])

login_limiter = SlidingWindowLimiter(
    max_attempts=settings.login_rate_limit,
    window_seconds=settings.login_rate_window_seconds,
)
register_limiter = SlidingWindowLimiter(
    max_attempts=10,
    window_seconds=3600,
)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    is_active: bool
    created_at: datetime


class MessageResponse(BaseModel):
    message: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def set_auth_cookie(
    response: Response,
    user_id: int,
    request: Request,
    db: Session,
) -> AuthSession:
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)

    session = AuthSession(
        user_id=user_id,
        jti=uuid4().hex,
        expires_at=expires_at,
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
        ip_address=get_client_ip(request),
    )
    db.add(session)
    db.commit()

    # The JWT carries the session id (jti) so it can be revoked server-side.
    token = create_access_token(
        user_id,
        jti=session.jti,
        expires_minutes=settings.access_token_expire_minutes,
    )

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
        domain=settings.cookie_domain,
    )

    return session


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=settings.cookie_secure,
        domain=settings.cookie_domain,
    )


def _rate_limit(limiter: SlidingWindowLimiter, key: str) -> None:
    retry_after = limiter.retry_after(key)

    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    data: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    _rate_limit(register_limiter, get_client_ip(request))

    password_error = validate_password_strength(data.password)
    if password_error:
        raise HTTPException(status_code=422, detail=password_error)

    email = normalize_email(str(data.email))

    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=email,
        password_hash=hash_password(data.password),
    )
    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Email already registered"
        ) from None

    register_limiter.hit(get_client_ip(request))
    set_auth_cookie(response, user.id, request, db)

    return user


@router.post("/login", response_model=UserResponse)
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = normalize_email(str(data.email))
    client_ip = get_client_ip(request)
    limit_key = f"{client_ip}:{email}"

    _rate_limit(login_limiter, limit_key)

    user = db.scalar(select(User).where(User.email == email))

    if (
        user is None
        or not verify_password(data.password, user.password_hash)
        or not user.is_active
    ):
        retry_after = login_limiter.hit(limit_key)

        if retry_after:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    login_limiter.reset(limit_key)
    set_auth_cookie(response, user.id, request, db)

    return user


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(COOKIE_NAME)

    if token:
        try:
            payload = decode_access_token(token)
            db.execute(
                update(AuthSession)
                .where(
                    AuthSession.jti == str(payload["jti"]),
                    AuthSession.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(UTC))
            )
            db.commit()
        except (jwt.InvalidTokenError, KeyError, TypeError, SQLAlchemyError):
            # Logout must always clear the cookie, even for a bad token
            # or a database hiccup while revoking the session.
            db.rollback()

    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}


@router.post("/logout-all", response_model=MessageResponse)
def logout_all(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.execute(
        update(AuthSession)
        .where(
            AuthSession.user_id == current_user.id,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    db.commit()

    clear_auth_cookie(response)
    return {"message": "All sessions revoked"}

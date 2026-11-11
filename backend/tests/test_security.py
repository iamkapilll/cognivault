"""Authentication primitive tests: hashing, password policy, JWT."""

from __future__ import annotations

import jwt
import pytest

from app.core.security import (
    ALGORITHM,
    create_access_token,
    decode_access_token,
    hash_password,
    validate_password_strength,
    verify_password,
)


def test_password_hash_roundtrip():
    hashed = hash_password("CorrectHorseBattery9!")

    assert hashed != "CorrectHorseBattery9!"
    assert verify_password("CorrectHorseBattery9!", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_verifying_a_corrupt_hash_fails_closed():
    assert verify_password("anything", "not-a-valid-hash") is False


@pytest.mark.parametrize(
    "password",
    [
        "",
        "short",
        "onlyletterslongenough",
        "123456789012345",
        "         ",
        "password1234",
    ],
)
def test_weak_passwords_are_rejected(password):
    assert validate_password_strength(password) is not None


def test_strong_password_is_accepted():
    assert validate_password_strength("CorrectHorseBattery9!") is None


def test_token_roundtrip_carries_identity_and_session_id():
    token = create_access_token(42, jti="abc123")
    payload = decode_access_token(token)

    assert payload["sub"] == "42"
    assert payload["jti"] == "abc123"
    assert payload["type"] == "access"


def test_expired_token_is_rejected():
    token = create_access_token(1, expires_minutes=-1)

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_token_signed_with_another_secret_is_rejected():
    forged = jwt.encode(
        {"sub": "1", "jti": "x", "iat": 0, "exp": 9999999999, "type": "access"},
        "a-different-secret-value-of-sufficient-length",
        algorithm=ALGORITHM,
    )

    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(forged)


def test_token_without_jti_is_rejected():
    forged = jwt.encode(
        {"sub": "1", "iat": 0, "exp": 9999999999, "type": "access"},
        "test-only-secret-key-with-more-than-32-characters",
        algorithm=ALGORITHM,
    )

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(forged)

"""HTTP surface tests that do not require a database connection."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

ORIGIN = "http://localhost:3000"


def build_client() -> TestClient:
    # The lifespan opens the LangGraph checkpointer and is not needed for
    # these routes, all of which fail before touching the database.
    return TestClient(app)


def test_health_is_public():
    response = build_client().get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_versioned_health_alias_works():
    assert build_client().get("/api/v1/health").status_code == 200


def test_security_headers_are_set():
    response = build_client().get("/health")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"


def test_current_user_requires_a_cookie():
    assert build_client().get("/auth/me").status_code == 401


def test_documents_require_authentication():
    assert build_client().get("/documents").status_code == 401


def test_conversations_require_authentication():
    assert build_client().get("/agent/conversations").status_code == 401


def test_trailing_slash_is_not_redirected_to_the_backend_host():
    # Regression test for the dashboard 401: a 307 here leaked the
    # internal backend URL and dropped the browser session cookie.
    response = build_client().get("/documents/")

    assert response.status_code == 404
    assert "location" not in {key.lower() for key in response.headers}


def test_writes_without_origin_are_rejected_before_authentication():
    response = build_client().post("/rag/ask", json={"question": "hello", "top_k": 4})

    assert response.status_code == 403


def test_writes_with_origin_reach_authentication():
    response = build_client().post(
        "/rag/ask",
        json={"question": "hello", "top_k": 4},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 401


def test_registration_rejects_a_common_password():
    response = build_client().post(
        "/auth/register",
        json={"email": "user@example.com", "password": "password1234"},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 422
    assert "common" in response.json()["detail"].lower()

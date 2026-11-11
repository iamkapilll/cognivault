"""CSRF middleware behaviour for cookie-authenticated mutations."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.csrf import csrf_origin_middleware

ALLOWED = "http://localhost:3000"


def build_app() -> TestClient:
    app = FastAPI()
    app.middleware("http")(csrf_origin_middleware)

    @app.post("/mutate")
    def mutate():
        return {"ok": True}

    @app.get("/read")
    def read():
        return {"ok": True}

    return TestClient(app)


def test_safe_method_without_origin_is_allowed():
    client = build_app()

    assert client.get("/read").status_code == 200


def test_write_with_allowed_origin_is_allowed():
    client = build_app()

    response = client.post("/mutate", headers={"Origin": ALLOWED})

    assert response.status_code == 200


def test_write_without_origin_is_blocked():
    client = build_app()

    assert client.post("/mutate").status_code == 403


def test_write_with_foreign_origin_is_blocked():
    client = build_app()

    response = client.post("/mutate", headers={"Origin": "https://evil.example"})

    assert response.status_code == 403


def test_cross_site_fetch_metadata_is_blocked_even_with_allowed_origin():
    client = build_app()

    response = client.post(
        "/mutate",
        headers={"Origin": ALLOWED, "Sec-Fetch-Site": "cross-site"},
    )

    assert response.status_code == 403


def test_referer_is_used_only_when_origin_is_absent():
    client = build_app()

    allowed = client.post("/mutate", headers={"Referer": f"{ALLOWED}/agent"})
    foreign = client.post(
        "/mutate",
        headers={"Origin": "https://evil.example", "Referer": ALLOWED},
    )

    assert allowed.status_code == 200
    assert foreign.status_code == 403

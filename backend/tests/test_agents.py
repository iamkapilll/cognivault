"""Agent CRUD HTTP tests using an isolated in-memory SQLite database."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.agent_config import DEFAULT_AGENT_MODEL, DEFAULT_AGENT_PROVIDER
from app.core.security import COOKIE_NAME, create_access_token
from app.database import Base, get_db
from app.main import app
from app.models import Agent, AuthSession, User

ORIGIN_HEADER = {"Origin": "http://localhost:3000"}


@dataclass
class AgentTestClient:
    client: TestClient
    session_factory: sessionmaker[Session]
    first_user_id: int
    second_user_id: int

    def authenticate(self, user_id: int) -> None:
        jti = uuid4().hex
        with self.session_factory.begin() as db:
            db.add(
                AuthSession(
                    user_id=user_id,
                    jti=jti,
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                )
            )
        self.client.cookies.set(
            COOKIE_NAME,
            create_access_token(user_id, jti=jti),
        )


@pytest.fixture
def agent_api() -> Iterator[AgentTestClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, AuthSession.__table__, Agent.__table__],
    )
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    def override_get_db() -> Iterator[Session]:
        with session_factory() as db:
            yield db

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    try:
        with session_factory.begin() as db:
            first_user = User(
                email="first-agent-user@example.com",
                password_hash="not-used-in-this-test",
            )
            second_user = User(
                email="second-agent-user@example.com",
                password_hash="not-used-in-this-test",
            )
            db.add_all([first_user, second_user])
            db.flush()
            first_user_id = first_user.id
            second_user_id = second_user.id

        yield AgentTestClient(
            client=TestClient(app),
            session_factory=session_factory,
            first_user_id=first_user_id,
            second_user_id=second_user_id,
        )
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override
        engine.dispose()


def valid_agent_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Research assistant",
        "description": "Find answers in owned research files.",
        "system_prompt": "Answer using the available evidence.",
        "model_provider": DEFAULT_AGENT_PROVIDER,
        "model_name": DEFAULT_AGENT_MODEL,
        "temperature": 0.4,
        "enabled_tools": ["search_documents"],
        "memory_enabled": True,
        "human_approval_required": True,
        "is_active": True,
    }
    payload.update(overrides)
    return payload


def create_agent(agent_api: AgentTestClient) -> dict[str, object]:
    response = agent_api.client.post(
        "/agents",
        json=valid_agent_payload(),
        headers=ORIGIN_HEADER,
    )
    assert response.status_code == 201
    return response.json()


def test_create_agent_persists_configuration_for_current_user(
    agent_api: AgentTestClient,
) -> None:
    agent_api.authenticate(agent_api.first_user_id)

    response = agent_api.client.post(
        "/agents",
        json=valid_agent_payload(),
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == agent_api.first_user_id
    assert body["name"] == "Research assistant"
    assert body["enabled_tools"] == ["search_documents"]
    assert body["created_at"]
    assert body["updated_at"]


def test_list_agents_only_returns_agents_owned_by_current_user(
    agent_api: AgentTestClient,
) -> None:
    agent_api.authenticate(agent_api.first_user_id)
    create_agent(agent_api)
    agent_api.authenticate(agent_api.second_user_id)
    create_agent(agent_api)
    agent_api.authenticate(agent_api.first_user_id)

    response = agent_api.client.get("/agents")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["agents"]) == 1
    assert body["agents"][0]["user_id"] == agent_api.first_user_id


def test_get_agent_returns_owned_agent(agent_api: AgentTestClient) -> None:
    agent_api.authenticate(agent_api.first_user_id)
    created = create_agent(agent_api)

    response = agent_api.client.get(f"/agents/{created['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_patch_agent_changes_only_supplied_fields(
    agent_api: AgentTestClient,
) -> None:
    agent_api.authenticate(agent_api.first_user_id)
    created = create_agent(agent_api)

    response = agent_api.client.patch(
        f"/agents/{created['id']}",
        json={"name": "Updated research assistant", "description": None},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Updated research assistant"
    assert body["description"] is None
    assert body["system_prompt"] == "Answer using the available evidence."
    assert body["temperature"] == 0.4


def test_delete_agent_removes_owned_agent(agent_api: AgentTestClient) -> None:
    agent_api.authenticate(agent_api.first_user_id)
    created = create_agent(agent_api)

    response = agent_api.client.delete(
        f"/agents/{created['id']}",
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 204
    assert agent_api.client.get(f"/agents/{created['id']}").status_code == 404


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/agents", None),
        ("post", "/agents", valid_agent_payload()),
        ("get", "/agents/1", None),
        ("patch", "/agents/1", {"name": "Changed"}),
        ("delete", "/agents/1", None),
    ],
)
def test_agent_endpoints_require_authentication(
    agent_api: AgentTestClient,
    method: str,
    path: str,
    body: dict[str, object] | None,
) -> None:
    request = getattr(agent_api.client, method)
    kwargs: dict[str, object] = {}
    if body is not None:
        kwargs["json"] = body
    if method in {"post", "patch", "delete"}:
        kwargs["headers"] = ORIGIN_HEADER

    response = request(path, **kwargs)

    assert response.status_code == 401


def test_foreign_user_cannot_get_patch_or_delete_agent(
    agent_api: AgentTestClient,
) -> None:
    agent_api.authenticate(agent_api.first_user_id)
    created = create_agent(agent_api)
    agent_api.authenticate(agent_api.second_user_id)

    assert agent_api.client.get(f"/agents/{created['id']}").status_code == 404
    assert (
        agent_api.client.patch(
            f"/agents/{created['id']}",
            json={"name": "Take over"},
            headers=ORIGIN_HEADER,
        ).status_code
        == 404
    )
    assert (
        agent_api.client.delete(
            f"/agents/{created['id']}",
            headers=ORIGIN_HEADER,
        ).status_code
        == 404
    )

    agent_api.authenticate(agent_api.first_user_id)
    owner_response = agent_api.client.get(f"/agents/{created['id']}")
    assert owner_response.status_code == 200
    assert owner_response.json()["name"] == "Research assistant"


@pytest.mark.parametrize(
    "overrides",
    [
        {"model_provider": "arbitrary-provider"},
        {"model_name": "provider/unknown-model"},
        {"temperature": -0.01},
        {"temperature": 2.01},
        {"enabled_tools": ["run_python"]},
        {"enabled_tools": ["search_documents", "search_documents"]},
        {"executable_code": "import os; os.remove('/')"},
    ],
)
def test_create_rejects_invalid_agent_configuration(
    agent_api: AgentTestClient,
    overrides: dict[str, object],
) -> None:
    agent_api.authenticate(agent_api.first_user_id)

    response = agent_api.client.post(
        "/agents",
        json=valid_agent_payload(**overrides),
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 422


def test_patch_rejects_invalid_configuration_without_changing_agent(
    agent_api: AgentTestClient,
) -> None:
    agent_api.authenticate(agent_api.first_user_id)
    created = create_agent(agent_api)

    response = agent_api.client.patch(
        f"/agents/{created['id']}",
        json={"enabled_tools": ["run_python"]},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 422
    unchanged = agent_api.client.get(f"/agents/{created['id']}").json()
    assert unchanged["enabled_tools"] == ["search_documents"]

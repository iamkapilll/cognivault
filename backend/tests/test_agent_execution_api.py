"""Cookie-authenticated custom-agent execution endpoint tests."""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.errors import GraphRecursionError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents import factory
from app.core.agent_config import DEFAULT_AGENT_MODEL, DEFAULT_AGENT_PROVIDER
from app.core.config import settings
from app.core.security import COOKIE_NAME, create_access_token
from app.database import Base, get_db
from app.main import app
from app.models import (
    Agent,
    AgentApproval,
    AgentAuditEvent,
    AuthSession,
    Conversation,
    Document,
    User,
)
from app.services import agent_execution, agent_tools
from app.services.agent_approvals import as_utc

ORIGIN_HEADER = {"Origin": "http://localhost:3000"}


@dataclass
class AgentTestClient:
    client: TestClient
    session_factory: sessionmaker[Session]
    first_user_id: int
    second_user_id: int
    checkpointer: InMemorySaver

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
        self.client.cookies.set(COOKIE_NAME, create_access_token(user_id, jti=jti))


@pytest.fixture
def agent_api() -> Iterator[AgentTestClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            AuthSession.__table__,
            Agent.__table__,
            Conversation.__table__,
            Document.__table__,
            AgentApproval.__table__,
            AgentAuditEvent.__table__,
        ],
    )
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db() -> Iterator[Session]:
        with session_factory() as db:
            yield db

    previous_override = app.dependency_overrides.get(get_db)
    had_checkpointer = hasattr(app.state, "custom_agent_checkpointer")
    previous_checkpointer = getattr(app.state, "custom_agent_checkpointer", None)
    previous_session_local = agent_execution.SessionLocal
    previous_tool_session_local = agent_tools.SessionLocal
    checkpointer = InMemorySaver()
    app.dependency_overrides[get_db] = override_get_db
    app.state.custom_agent_checkpointer = checkpointer
    agent_execution.SessionLocal = session_factory
    agent_tools.SessionLocal = session_factory
    try:
        with session_factory.begin() as db:
            first_user = User(
                email="execution-first@example.com",
                password_hash="not-used-in-test",
            )
            second_user = User(
                email="execution-second@example.com",
                password_hash="not-used-in-test",
            )
            db.add_all([first_user, second_user])
            db.flush()
            ids = (first_user.id, second_user.id)
        yield AgentTestClient(TestClient(app), session_factory, *ids, checkpointer)
    finally:
        agent_execution.SessionLocal = previous_session_local
        agent_tools.SessionLocal = previous_tool_session_local
        if had_checkpointer:
            app.state.custom_agent_checkpointer = previous_checkpointer
        else:
            del app.state.custom_agent_checkpointer
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override
        engine.dispose()


class FakeModel:
    def __init__(self, *, answer: str = "Custom agent answer.") -> None:
        self.answer = answer
        self.bound_names: list[str] = []
        self.invocations: list[object] = []

    def bind_tools(self, tools: list[Any]) -> FakeModel:
        self.bound_names = [tool.name for tool in tools]
        return self

    def invoke(self, messages: object) -> AIMessage:
        self.invocations.append(messages)
        return AIMessage(content=self.answer)


class FakeToolModel(FakeModel):
    def __init__(
        self,
        tool_name: str,
        arguments: dict[str, object],
        *,
        answer: str = "The action finished.",
    ) -> None:
        super().__init__(answer=answer)
        self.tool_name = tool_name
        self.arguments = arguments

    def invoke(self, messages: object) -> AIMessage:
        self.invocations.append(messages)
        if len(self.invocations) == 1:
            return AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": self.tool_name,
                        "args": self.arguments,
                        "id": "test-call-1",
                        "type": "tool_call",
                    }
                ],
            )
        return AIMessage(content=self.answer)


class FakeStreamingGraph:
    def stream(
        self,
        _payload: object,
        *,
        config: dict[str, Any],
        stream_mode: list[str],
    ) -> Iterator[tuple[str, Any]]:
        yield "custom", {"cognivault_event": "text_delta", "text": "First "}
        yield (
            "custom",
            {
                "cognivault_event": "text_delta",
                "text": "incremental answer.",
            },
        )
        yield (
            "updates",
            {"chatbot": {"messages": [AIMessage(content="First incremental answer.")]}},
        )


def create_executable_agent(
    api: AgentTestClient,
    *,
    user_id: int | None = None,
    **overrides: object,
) -> dict[str, Any]:
    api.authenticate(user_id or api.first_user_id)
    payload = {
        "name": "Execution test agent",
        "description": "Only used by endpoint tests.",
        "system_prompt": "Answer the user's request safely.",
        "model_provider": DEFAULT_AGENT_PROVIDER,
        "model_name": DEFAULT_AGENT_MODEL,
        "temperature": 0.3,
        "enabled_tools": [],
        "memory_enabled": False,
        "human_approval_required": False,
        "is_active": True,
    }
    payload.update(overrides)
    response = api.client.post("/agents", json=payload, headers=ORIGIN_HEADER)
    assert response.status_code == 201, response.text
    return response.json()


def _start_delete_approval(
    api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
    *,
    streamed: bool = False,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], int, FakeToolModel]:
    with api.session_factory.begin() as db:
        document = Document(
            user_id=api.first_user_id,
            filename="approval-target.pdf",
            status="completed",
        )
        db.add(document)
        db.flush()
        document_id = document.id

    model = FakeToolModel("delete_document", {"document_id": document_id})
    mock_factory_model(monkeypatch, model)
    agent = create_executable_agent(
        api,
        enabled_tools=["delete_document"],
        memory_enabled=True,
        human_approval_required=False,
    )
    conversation_response = api.client.post(
        f"/agents/{agent['id']}/conversations",
        json={},
        headers=ORIGIN_HEADER,
    )
    assert conversation_response.status_code == 201, conversation_response.text
    conversation = conversation_response.json()
    endpoint = (
        f"/agents/{agent['id']}/stream" if streamed else f"/agents/{agent['id']}/invoke"
    )
    response = api.client.post(
        endpoint,
        json={"message": "Delete my document", "conversation_id": conversation["id"]},
        headers=ORIGIN_HEADER,
    )
    assert response.status_code == 200, response.text
    if streamed:
        assert "event: approval_required" in response.text
        assert "event: run_paused" in response.text
        approval = api.client.get(
            f"/agents/{agent['id']}/approvals",
            headers=ORIGIN_HEADER,
        ).json()["approvals"][0]
    else:
        payload = response.json()
        assert payload["status"] == "approval_required"
        approval = payload["approval"]
    return agent, conversation, approval, document_id, model


def mock_factory_model(monkeypatch: pytest.MonkeyPatch, model: FakeModel) -> None:
    monkeypatch.setattr(factory, "create_chat_model", lambda *_args, **_kwargs: model)


def test_invoke_runs_owned_agent_with_cookie_and_returns_only_final_answer(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = FakeModel(answer="The selected report has two primary risks.")
    mock_factory_model(monkeypatch, model)
    agent = create_executable_agent(agent_api)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "Summarize the report."},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 200
    assert response.json()["agent_id"] == agent["id"]
    assert response.json()["response"] == "The selected report has two primary risks."
    assert response.json()["run_id"]
    assert set(response.json()) == {"run_id", "agent_id", "response"}


def test_invoke_binds_only_tools_saved_in_agent_configuration(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = FakeModel()
    mock_factory_model(monkeypatch, model)
    agent = create_executable_agent(
        agent_api,
        enabled_tools=["get_document_details"],
    )

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "What is the document status?"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 200
    assert model.bound_names == ["get_document_details"]


def create_memory_conversation(api: AgentTestClient, agent_id: int) -> dict[str, Any]:
    response = api.client.post(
        f"/agents/{agent_id}/conversations",
        json={"title": "Project notes"},
        headers=ORIGIN_HEADER,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_memory_agent_persists_history_and_exposes_paginated_public_messages(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = FakeModel(answer="Remembered answer.")
    mock_factory_model(monkeypatch, model)
    agent = create_executable_agent(agent_api, memory_enabled=True)
    conversation = create_memory_conversation(agent_api, agent["id"])
    assert "thread_id" not in conversation

    for message in ("First question", "Follow-up question"):
        response = agent_api.client.post(
            f"/agents/{agent['id']}/invoke",
            json={"message": message, "conversation_id": conversation["id"]},
            headers=ORIGIN_HEADER,
        )
        assert response.status_code == 200, response.text
        assert response.json()["conversation_id"] == conversation["id"]
        assert "thread_id" not in response.json()

    second_prompt = model.invocations[1]
    visible = [
        (item.type, item.content) for item in second_prompt if item.type != "system"
    ]
    assert visible == [
        ("human", "First question"),
        ("ai", "Remembered answer."),
        ("human", "Follow-up question"),
    ]

    page = agent_api.client.get(
        f"/agents/{agent['id']}/conversations/{conversation['id']}/messages?offset=1&limit=2"
    )
    assert page.status_code == 200, page.text
    assert page.json() == {
        "conversation_id": conversation["id"],
        "total": 4,
        "offset": 1,
        "limit": 2,
        "messages": [
            {"role": "assistant", "content": "Remembered answer."},
            {"role": "user", "content": "Follow-up question"},
        ],
    }

    listing = agent_api.client.get(
        f"/agents/{agent['id']}/conversations?offset=0&limit=1"
    )
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["conversations"][0]["id"] == conversation["id"]


def test_memory_agent_streaming_appends_to_the_same_conversation(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model = FakeModel(answer="Streamed persistent answer.")
    mock_factory_model(monkeypatch, model)
    agent = create_executable_agent(agent_api, memory_enabled=True)
    conversation = create_memory_conversation(agent_api, agent["id"])

    response = agent_api.client.post(
        f"/agents/{agent['id']}/stream",
        json={
            "message": "Remember this streamed turn",
            "conversation_id": conversation["id"],
        },
        headers=ORIGIN_HEADER,
    )
    assert response.status_code == 200
    assert '"conversation_id":' + str(conversation["id"]) in response.text
    assert "event: run_completed" in response.text
    assert "thread_id" not in response.text

    history = agent_api.client.get(
        f"/agents/{agent['id']}/conversations/{conversation['id']}/messages"
    )
    assert history.status_code == 200
    assert history.json()["messages"] == [
        {"role": "user", "content": "Remember this streamed turn"},
        {"role": "assistant", "content": "Streamed persistent answer."},
    ]


def test_memory_conversation_crud_is_owner_scoped_and_cleans_its_checkpoint(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_factory_model(monkeypatch, FakeModel())
    agent = create_executable_agent(agent_api, memory_enabled=True)
    conversation = create_memory_conversation(agent_api, agent["id"])
    invoke = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "Save this turn", "conversation_id": conversation["id"]},
        headers=ORIGIN_HEADER,
    )
    assert invoke.status_code == 200

    with agent_api.session_factory() as db:
        persisted = db.get(Conversation, conversation["id"])
        assert persisted is not None
        thread_id = persisted.thread_id
    assert (
        agent_api.checkpointer.get_tuple({"configurable": {"thread_id": thread_id}})
        is not None
    )

    agent_api.authenticate(agent_api.second_user_id)
    foreign_path = f"/agents/{agent['id']}/conversations/{conversation['id']}"
    assert agent_api.client.get(foreign_path).status_code == 404
    assert (
        agent_api.client.get(f"/agents/{agent['id']}/conversations").status_code == 404
    )
    assert (
        agent_api.client.patch(
            foreign_path, json={"title": "Taken"}, headers=ORIGIN_HEADER
        ).status_code
        == 404
    )
    assert (
        agent_api.client.delete(foreign_path, headers=ORIGIN_HEADER).status_code == 404
    )

    agent_api.authenticate(agent_api.first_user_id)
    renamed = agent_api.client.patch(
        foreign_path,
        json={"title": "Renamed project"},
        headers=ORIGIN_HEADER,
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Renamed project"
    deleted = agent_api.client.delete(foreign_path, headers=ORIGIN_HEADER)
    assert deleted.status_code == 204
    assert (
        agent_api.checkpointer.get_tuple({"configurable": {"thread_id": thread_id}})
        is None
    )


def test_agent_memory_cannot_be_disabled_with_saved_conversations(
    agent_api: AgentTestClient,
) -> None:
    agent = create_executable_agent(agent_api, memory_enabled=True)
    create_memory_conversation(agent_api, agent["id"])

    response = agent_api.client.patch(
        f"/agents/{agent['id']}",
        json={"memory_enabled": False},
        headers=ORIGIN_HEADER,
    )
    assert response.status_code == 409


def test_deleting_memory_agent_removes_its_conversations_and_checkpoint(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_factory_model(monkeypatch, FakeModel())
    agent = create_executable_agent(agent_api, memory_enabled=True)
    conversation = create_memory_conversation(agent_api, agent["id"])
    invoked = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "Persist this", "conversation_id": conversation["id"]},
        headers=ORIGIN_HEADER,
    )
    assert invoked.status_code == 200

    with agent_api.session_factory() as db:
        persisted = db.get(Conversation, conversation["id"])
        assert persisted is not None
        thread_id = persisted.thread_id
    deleted = agent_api.client.delete(
        f"/agents/{agent['id']}",
        headers=ORIGIN_HEADER,
    )
    assert deleted.status_code == 204
    with agent_api.session_factory() as db:
        assert db.get(Conversation, conversation["id"]) is None
    assert (
        agent_api.checkpointer.get_tuple({"configurable": {"thread_id": thread_id}})
        is None
    )


def test_conversation_creation_requires_authentication_and_csrf(
    agent_api: AgentTestClient,
) -> None:
    unauthenticated = agent_api.client.post(
        "/agents/1/conversations",
        json={},
        headers=ORIGIN_HEADER,
    )
    assert unauthenticated.status_code == 401

    agent = create_executable_agent(agent_api, memory_enabled=True)
    missing_origin = agent_api.client.post(
        f"/agents/{agent['id']}/conversations",
        json={},
    )
    assert missing_origin.status_code == 403


def test_conversation_rename_and_delete_require_csrf_origin(
    agent_api: AgentTestClient,
) -> None:
    agent = create_executable_agent(agent_api, memory_enabled=True)
    conversation = create_memory_conversation(agent_api, agent["id"])
    path = f"/agents/{agent['id']}/conversations/{conversation['id']}"

    renamed = agent_api.client.patch(path, json={"title": "Missing origin"})
    deleted = agent_api.client.delete(path)
    assert renamed.status_code == 403
    assert deleted.status_code == 403


@pytest.mark.parametrize(
    ("memory_enabled", "payload", "expected_status"),
    [
        (True, {"message": "hello"}, 422),
        (False, {"message": "hello", "conversation_id": 1}, 422),
        (True, {"message": "hello", "conversation_id": 1, "thread_id": "raw"}, 422),
    ],
)
def test_memory_mode_requires_server_owned_conversation_reference(
    agent_api: AgentTestClient,
    memory_enabled: bool,
    payload: dict[str, object],
    expected_status: int,
) -> None:
    agent = create_executable_agent(agent_api, memory_enabled=memory_enabled)
    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json=payload,
        headers=ORIGIN_HEADER,
    )
    assert response.status_code == expected_status


def test_stream_endpoint_emits_named_incremental_sse_events(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(agent_api)
    monkeypatch.setattr(
        agent_execution,
        "build_agent_for_user",
        lambda *_args: FakeStreamingGraph(),
    )

    response = agent_api.client.post(
        f"/agents/{agent['id']}/stream",
        json={"message": "Stream a response."},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: run_started" in body
    assert "event: text_delta" in body
    assert '"text":"First "' in body
    assert '"text":"incremental answer."' in body
    assert "event: run_completed" in body
    assert body.count("First incremental answer.") == 0


@pytest.mark.parametrize("path", ["invoke", "stream"])
def test_custom_execution_requires_cookie_authentication(
    agent_api: AgentTestClient,
    path: str,
) -> None:
    response = agent_api.client.post(
        f"/agents/1/{path}",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 401


@pytest.mark.parametrize("path", ["invoke", "stream"])
@pytest.mark.parametrize("origin", [None, "https://attacker.example"])
def test_custom_execution_write_requires_valid_csrf_origin(
    agent_api: AgentTestClient,
    path: str,
    origin: str | None,
) -> None:
    agent = create_executable_agent(agent_api)
    headers = {} if origin is None else {"Origin": origin}

    response = agent_api.client.post(
        f"/agents/{agent['id']}/{path}",
        json={"message": "hello"},
        headers=headers,
    )

    assert response.status_code == 403


@pytest.mark.parametrize("path", ["invoke", "stream"])
def test_other_user_cannot_invoke_custom_agent(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
    path: str,
) -> None:
    agent = create_executable_agent(agent_api)
    model = FakeModel()
    mock_factory_model(monkeypatch, model)
    agent_api.authenticate(agent_api.second_user_id)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/{path}",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 404
    assert model.bound_names == []


def test_selected_foreign_document_is_rejected_before_agent_construction(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(agent_api)
    with agent_api.session_factory.begin() as db:
        foreign = Document(user_id=agent_api.second_user_id, filename="private.pdf")
        db.add(foreign)
        db.flush()
        foreign_document_id = foreign.id

    def should_not_build(*_args: object) -> object:
        pytest.fail("agent must not be built for a foreign document")

    monkeypatch.setattr(agent_execution, "build_agent_for_user", should_not_build)
    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "read this", "document_ids": [foreign_document_id]},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 404


def test_inactive_agent_is_rejected(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(agent_api, is_active=False)
    model = FakeModel()
    mock_factory_model(monkeypatch, model)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 409
    assert model.bound_names == []


@pytest.mark.parametrize(
    "capability",
    ["memory_enabled", "human_approval_required"],
)
def test_memory_and_approval_settings_fail_closed(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
    capability: str,
) -> None:
    if capability == "human_approval_required":
        agent = create_executable_agent(
            agent_api,
            memory_enabled=True,
            human_approval_required=True,
        )
    else:
        agent = create_executable_agent(agent_api, memory_enabled=True)
    model = FakeModel()
    mock_factory_model(monkeypatch, model)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 422
    assert model.bound_names == []


def test_destructive_tool_is_rejected_for_custom_execution(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(
        agent_api,
        enabled_tools=["delete_document"],
        memory_enabled=True,
    )
    model = FakeModel()
    mock_factory_model(monkeypatch, model)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "delete the file"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 422
    assert model.bound_names == []


def test_unavailable_server_tool_is_sanitized_as_service_unavailable(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(agent_api, enabled_tools=["search_web"])
    monkeypatch.setattr(settings, "tavily_api_key", "")

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "Find news"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 503
    assert "TAVILY" not in response.text


def test_unavailable_model_provider_is_sanitized_as_service_unavailable(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(agent_api)
    monkeypatch.setattr(settings, "groq_api_key", "")

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 503
    assert "groq" not in response.text.lower()


def test_invalid_persisted_tool_configuration_is_rejected(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(agent_api)
    with agent_api.session_factory.begin() as db:
        persisted = db.get(Agent, agent["id"])
        assert persisted is not None
        persisted.enabled_tools = ["run_python"]
    model = FakeModel()
    mock_factory_model(monkeypatch, model)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 422
    assert model.bound_names == []


def test_provider_failure_does_not_leak_prompt_or_secret(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "must-not-leak-provider-key"

    class BrokenModel(FakeModel):
        def invoke(self, _messages: object) -> AIMessage:
            raise RuntimeError(f"{secret} private prompt and provider payload")

    mock_factory_model(monkeypatch, BrokenModel())
    agent = create_executable_agent(agent_api)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 502
    assert secret not in response.text
    assert "private prompt" not in response.text


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "   "},
        {"message": "x" * 4001},
        {"message": "hello", "document_ids": [1] * 21},
        {"message": "hello", "user_id": 7},
    ],
)
def test_invalid_or_oversized_execution_input_is_rejected(
    agent_api: AgentTestClient,
    payload: dict[str, object],
) -> None:
    agent = create_executable_agent(agent_api)
    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json=payload,
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 422


def test_recursion_limit_is_returned_as_sanitized_validation_error(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RecursionModel(FakeModel):
        def invoke(self, _messages: object) -> AIMessage:
            raise GraphRecursionError("internal graph details")

    mock_factory_model(monkeypatch, RecursionModel())
    agent = create_executable_agent(agent_api)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "loop forever"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 422
    assert "internal graph details" not in response.text


def test_invoke_timeout_maps_to_gateway_timeout(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    done = threading.Event()

    class SlowModel(FakeModel):
        def invoke(self, _messages: object) -> AIMessage:
            time.sleep(0.05)
            done.set()
            return AIMessage(content="late")

    mock_factory_model(monkeypatch, SlowModel())
    monkeypatch.setattr(settings, "custom_agent_execution_timeout_seconds", 0)
    agent = create_executable_agent(agent_api)
    monkeypatch.setattr(settings, "custom_agent_execution_timeout_seconds", 0)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "slow"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 504
    assert done.wait(1)


def test_stream_failure_is_a_sanitized_error_event(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class BrokenGraph:
        def stream(self, *_args: object, **_kwargs: object):
            raise RuntimeError("secret provider payload")
            yield "unreachable", None

    agent = create_executable_agent(agent_api)
    monkeypatch.setattr(
        agent_execution,
        "build_agent_for_user",
        lambda *_args: BrokenGraph(),
    )

    response = agent_api.client.post(
        f"/agents/{agent['id']}/stream",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 200
    assert "event: error" in response.text
    assert "secret provider payload" not in response.text


def test_stream_deadline_emits_sanitized_timeout_event(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(agent_api)
    monkeypatch.setattr(
        agent_execution,
        "build_agent_for_user",
        lambda *_args: FakeStreamingGraph(),
    )
    monkeypatch.setattr(settings, "custom_agent_execution_timeout_seconds", 0)

    response = agent_api.client.post(
        f"/agents/{agent['id']}/stream",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 200
    assert '"code":"execution_timeout"' in response.text


def test_factory_uses_configured_provider_request_timeout(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = create_executable_agent(agent_api)
    calls: list[dict[str, object]] = []

    def fake_model(*_args: object, **options: object) -> FakeModel:
        calls.append(options)
        return FakeModel()

    monkeypatch.setattr(factory, "create_chat_model", fake_model)
    monkeypatch.setattr(settings, "custom_agent_execution_timeout_seconds", 37)
    response = agent_api.client.post(
        f"/agents/{agent['id']}/invoke",
        json={"message": "hello"},
        headers=ORIGIN_HEADER,
    )

    assert response.status_code == 200
    assert calls[0]["request_timeout"] == 37.0


def test_custom_destructive_call_is_persisted_and_paused_before_execution(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, document_id, model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    listed = agent_api.client.get(
        f"/agents/{agent['id']}/approvals",
        headers=ORIGIN_HEADER,
    )
    detailed = agent_api.client.get(
        f"/agents/{agent['id']}/approvals/{approval['id']}",
        headers=ORIGIN_HEADER,
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert detailed.status_code == 200
    assert detailed.json()["action_summary"] == (
        f"Permanently delete 'approval-target.pdf' (document {document_id})."
    )
    assert "validated_arguments" not in detailed.json()
    assert len(model.invocations) == 1
    with agent_api.session_factory() as db:
        assert db.get(Document, document_id) is not None
        stored = db.get(AgentApproval, UUID(approval["id"]))
        assert stored is not None
        assert stored.status == "pending"
        assert stored.validated_arguments == {"document_id": document_id}
        assert stored.arguments_sha256
        assert as_utc(stored.expires_at) > datetime.now(UTC)
        assert (
            db.query(AgentAuditEvent).filter_by(event_type="approval_requested").count()
            == 1
        )


def test_approved_action_resumes_once_and_cannot_be_replayed(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    approval_path = f"/agents/{agent['id']}/approvals/{approval['id']}"
    decided = agent_api.client.post(
        f"{approval_path}/approve",
        headers=ORIGIN_HEADER,
    )
    assert decided.status_code == 200
    assert decided.json()["approval"]["status"] == "approved"

    resumed = agent_api.client.post(f"{approval_path}/resume", headers=ORIGIN_HEADER)
    assert resumed.status_code == 200
    assert "event: run_resumed" in resumed.text
    assert "event: run_completed" in resumed.text
    assert "event: error" not in resumed.text
    with agent_api.session_factory() as db:
        assert db.get(Document, document_id) is None
        stored = db.get(AgentApproval, UUID(approval["id"]))
        assert stored is not None
        assert stored.status == "executed"
        assert stored.executed_at is not None

    replay = agent_api.client.post(f"{approval_path}/resume", headers=ORIGIN_HEADER)
    assert replay.status_code == 409


def test_rejected_action_resumes_without_execution_and_emits_event(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    approval_path = f"/agents/{agent['id']}/approvals/{approval['id']}"
    rejected = agent_api.client.post(
        f"{approval_path}/reject",
        headers=ORIGIN_HEADER,
    )
    assert rejected.status_code == 200
    resumed = agent_api.client.post(f"{approval_path}/resume", headers=ORIGIN_HEADER)
    assert resumed.status_code == 200
    assert "event: approval_rejected" in resumed.text
    assert "event: run_completed" in resumed.text
    with agent_api.session_factory() as db:
        assert db.get(Document, document_id) is not None
        assert db.get(AgentApproval, UUID(approval["id"])).status == "rejected"


def test_approval_routes_enforce_authentication_and_owner_agent_scope(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, _document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    approval_path = f"/agents/{agent['id']}/approvals/{approval['id']}"
    agent_api.client.cookies.clear()
    unauthenticated = agent_api.client.get(
        f"/agents/{agent['id']}/approvals",
        headers=ORIGIN_HEADER,
    )
    assert unauthenticated.status_code == 401

    agent_api.authenticate(agent_api.second_user_id)
    cross_user = agent_api.client.post(
        f"{approval_path}/approve",
        headers=ORIGIN_HEADER,
    )
    assert cross_user.status_code == 404

    agent_api.authenticate(agent_api.first_user_id)
    other_agent = create_executable_agent(agent_api, memory_enabled=True)
    cross_agent = agent_api.client.get(
        f"/agents/{other_agent['id']}/approvals/{approval['id']}",
        headers=ORIGIN_HEADER,
    )
    assert cross_agent.status_code == 404


def test_expired_approval_cannot_be_decided_or_resumed(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    with agent_api.session_factory.begin() as db:
        stored = db.get(AgentApproval, UUID(approval["id"]))
        assert stored is not None
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    path = f"/agents/{agent['id']}/approvals/{approval['id']}"
    decided = agent_api.client.post(f"{path}/approve", headers=ORIGIN_HEADER)
    assert decided.status_code == 409
    resumed = agent_api.client.post(f"{path}/resume", headers=ORIGIN_HEADER)
    assert resumed.status_code == 200
    assert "event: run_completed" in resumed.text
    with agent_api.session_factory() as db:
        assert db.get(Document, document_id) is not None
        assert db.get(AgentApproval, UUID(approval["id"])).status == "expired"


def test_conflicting_approval_decisions_are_rejected(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, _document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    path = f"/agents/{agent['id']}/approvals/{approval['id']}"
    approved = agent_api.client.post(f"{path}/approve", headers=ORIGIN_HEADER)
    rejected = agent_api.client.post(f"{path}/reject", headers=ORIGIN_HEADER)
    assert approved.status_code == 200
    assert rejected.status_code == 409


def test_changed_document_ownership_invalidates_approved_action(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    with agent_api.session_factory.begin() as db:
        document = db.get(Document, document_id)
        assert document is not None
        document.user_id = agent_api.second_user_id
    path = f"/agents/{agent['id']}/approvals/{approval['id']}"
    approved = agent_api.client.post(f"{path}/approve", headers=ORIGIN_HEADER)
    assert approved.status_code == 200
    resumed = agent_api.client.post(f"{path}/resume", headers=ORIGIN_HEADER)
    assert resumed.status_code == 200
    assert "event: run_completed" in resumed.text
    with agent_api.session_factory() as db:
        assert db.get(Document, document_id) is not None
        stored = db.get(AgentApproval, UUID(approval["id"]))
        assert stored is not None
        assert stored.status == "invalidated"


def test_agent_deletion_removes_approval_and_prevents_resume(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    deleted = agent_api.client.delete(
        f"/agents/{agent['id']}",
        headers=ORIGIN_HEADER,
    )
    assert deleted.status_code == 204
    assert (
        agent_api.client.post(
            f"/agents/{agent['id']}/approvals/{approval['id']}/resume",
            headers=ORIGIN_HEADER,
        ).status_code
        == 404
    )
    with agent_api.session_factory() as db:
        assert db.get(Document, document_id) is not None
        assert db.get(AgentApproval, UUID(approval["id"])) is None


def test_conversation_deletion_removes_its_approval(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, conversation, approval, _document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    deleted = agent_api.client.delete(
        f"/agents/{agent['id']}/conversations/{conversation['id']}",
        headers=ORIGIN_HEADER,
    )
    assert deleted.status_code == 204
    assert (
        agent_api.client.get(
            f"/agents/{agent['id']}/approvals/{approval['id']}",
            headers=ORIGIN_HEADER,
        ).status_code
        == 404
    )
    with agent_api.session_factory() as db:
        assert db.get(AgentApproval, UUID(approval["id"])) is None


def test_inactive_agent_cannot_resume_an_approved_action(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    with agent_api.session_factory.begin() as db:
        stored_agent = db.get(Agent, agent["id"])
        assert stored_agent is not None
        stored_agent.is_active = False
    path = f"/agents/{agent['id']}/approvals/{approval['id']}"
    assert (
        agent_api.client.post(f"{path}/approve", headers=ORIGIN_HEADER).status_code
        == 200
    )
    resumed = agent_api.client.post(f"{path}/resume", headers=ORIGIN_HEADER)
    assert resumed.status_code == 409
    with agent_api.session_factory() as db:
        assert db.get(Document, document_id) is not None


def test_modified_approval_arguments_fail_closed(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _conversation, approval, document_id, _model = _start_delete_approval(
        agent_api,
        monkeypatch,
    )
    with agent_api.session_factory.begin() as db:
        stored = db.get(AgentApproval, UUID(approval["id"]))
        assert stored is not None
        stored.validated_arguments = {"document_id": document_id + 1000}
    path = f"/agents/{agent['id']}/approvals/{approval['id']}"
    assert (
        agent_api.client.post(f"{path}/approve", headers=ORIGIN_HEADER).status_code
        == 200
    )
    resumed = agent_api.client.post(f"{path}/resume", headers=ORIGIN_HEADER)
    assert resumed.status_code == 200
    assert '"code":"execution_failed"' in resumed.text
    with agent_api.session_factory() as db:
        assert db.get(Document, document_id) is not None
        assert db.get(AgentApproval, UUID(approval["id"])).status == "approved"


def test_stream_reports_approval_pause_for_custom_tool(
    agent_api: AgentTestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _start_delete_approval(agent_api, monkeypatch, streamed=True)

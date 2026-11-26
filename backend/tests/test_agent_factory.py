"""Dynamic agent factory tests with a mocked Groq chat model."""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass

import pytest
from fastapi import HTTPException
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import BaseTool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents import factory
from app.agents.factory import (
    SECURITY_POLICY,
    AgentExecutionContextError,
    InactiveAgentError,
    InvalidAgentConfigurationError,
    UnavailableAgentProviderError,
    UnavailableAgentToolError,
    UnsupportedAgentCapabilityError,
    _bounded_history,
    build_agent_for_user,
)
from app.core.agent_config import DEFAULT_AGENT_MODEL, DEFAULT_AGENT_PROVIDER
from app.core.config import settings
from app.core.context import current_document_context, current_user_id
from app.database import Base
from app.models import Agent, Document, User
from app.services import agent_tools
from app.services.agent_tools import get_document_details
from app.services.tool_registry import TOOL_REGISTRY, ToolRegistry


@dataclass
class AgentFactoryDatabase:
    session: Session
    session_factory: sessionmaker[Session]
    owner: User
    other_user: User


class FakeChatModel:
    def __init__(self, **parameters: object) -> None:
        self.parameters = parameters
        self.bound_tools: list[BaseTool] | None = None
        self.messages: list[BaseMessage] | None = None

    def bind_tools(self, tools: Sequence[BaseTool]) -> FakeChatModel:
        self.bound_tools = list(tools)
        return self

    def invoke(self, messages: Sequence[BaseMessage]) -> AIMessage:
        self.messages = list(messages)
        return AIMessage(content="Mocked response")


class FakeToolCallingChatModel(FakeChatModel):
    def __init__(self, document_id: int, **parameters: object) -> None:
        super().__init__(**parameters)
        self.document_id = document_id
        self.invocation_count = 0

    def invoke(self, messages: Sequence[BaseMessage]) -> AIMessage:
        self.messages = list(messages)
        self.invocation_count += 1
        if self.invocation_count == 1:
            return AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "get_document_details",
                        "args": {"document_id": self.document_id},
                        "id": "mock-tool-call",
                        "type": "tool_call",
                    }
                ],
            )
        return AIMessage(content="Mocked response after tool call")


class StreamingFakeToolCallingModel(FakeChatModel):
    def __init__(self) -> None:
        super().__init__()
        self.invocation_count = 0

    def stream(self, messages: Sequence[BaseMessage]) -> Iterator[AIMessageChunk]:
        self.messages = list(messages)
        self.invocation_count += 1
        if self.invocation_count == 1:
            yield AIMessageChunk(
                content="",
                tool_call_chunks=[
                    {
                        "name": "get_document_details",
                        "args": '{"document_id": 1}',
                        "id": "streamed-call-1",
                        "index": 0,
                        "type": "tool_call_chunk",
                    }
                ],
            )
        else:
            yield AIMessageChunk(content="The file is completed.")


class StreamingFakeChatModel(FakeChatModel):
    def stream(self, messages: Sequence[BaseMessage]) -> Iterator[AIMessageChunk]:
        self.messages = list(messages)
        yield AIMessageChunk(content="Incremental ")
        yield AIMessageChunk(
            content="private reasoning",
            additional_kwargs={"reasoning": "private"},
        )
        yield AIMessageChunk(content="custom response.")


@pytest.fixture
def agent_factory_database() -> Iterator[AgentFactoryDatabase]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, Agent.__table__, Document.__table__],
    )
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    try:
        with session_factory() as db:
            owner = User(
                email="factory-owner@example.com",
                password_hash="not-used-in-this-test",
            )
            other_user = User(
                email="factory-other@example.com",
                password_hash="not-used-in-this-test",
            )
            db.add_all([owner, other_user])
            db.commit()
            db.refresh(owner)
            db.refresh(other_user)
            yield AgentFactoryDatabase(db, session_factory, owner, other_user)
    finally:
        engine.dispose()


@pytest.fixture
def fake_chat_models(
    monkeypatch: pytest.MonkeyPatch,
) -> list[FakeChatModel]:
    models: list[FakeChatModel] = []

    def create_fake_model(
        provider: str,
        model_name: str,
        temperature: float,
        **options: object,
    ) -> FakeChatModel:
        model = FakeChatModel(
            provider=provider,
            model=model_name,
            temperature=temperature,
            **options,
        )
        models.append(model)
        return model

    monkeypatch.setattr(factory, "create_chat_model", create_fake_model)
    return models


def save_agent(
    db: Session,
    owner: User,
    **overrides: object,
) -> Agent:
    configuration: dict[str, object] = {
        "name": "Factory test agent",
        "description": None,
        "system_prompt": "Use the configured tools to answer clearly.",
        "model_provider": DEFAULT_AGENT_PROVIDER,
        "model_name": DEFAULT_AGENT_MODEL,
        "temperature": 0.35,
        "enabled_tools": ["get_document_details"],
        "memory_enabled": False,
        "human_approval_required": False,
        "is_active": True,
    }
    configuration.update(overrides)
    agent = Agent(user_id=owner.id, **configuration)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def invoke_as_user(
    graph: CompiledStateGraph,
    user_id: int,
    prompt: str = "Hello",
) -> dict[str, list[BaseMessage]]:
    token = current_user_id.set(user_id)
    try:
        return graph.invoke({"messages": [HumanMessage(content=prompt)]})
    finally:
        current_user_id.reset(token)


def test_builds_agent_with_saved_model_temperature_and_registered_tools(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
    )

    graph = build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
    )
    result = invoke_as_user(graph, agent_factory_database.owner.id)

    model = fake_chat_models[0]
    assert model.parameters["model"] == DEFAULT_AGENT_MODEL
    assert model.parameters["temperature"] == 0.35
    assert model.bound_tools == [get_document_details]
    assert result["messages"][-1].content == "Mocked response"
    # Direct registry instances retain their own ContextVar authentication guard.
    assert model.bound_tools[0].invoke({"document_id": 1}) == "Not authenticated."


def test_memory_graph_restores_prior_turns_from_its_attached_checkpointer(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=[],
        memory_enabled=True,
    )
    checkpointer = InMemorySaver()
    graph = build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
        checkpointer=checkpointer,
    )
    thread_id = "server-generated-test-thread"
    config = {"configurable": {"thread_id": thread_id}}
    token = current_user_id.set(agent_factory_database.owner.id)
    try:
        graph.invoke({"messages": [HumanMessage(content="First turn")]}, config)
        graph.invoke({"messages": [HumanMessage(content="Second turn")]}, config)
        state = graph.get_state(config)
    finally:
        current_user_id.reset(token)

    model = fake_chat_models[0]
    visible = [message for message in model.messages or [] if message.type != "system"]
    assert [message.content for message in visible] == [
        "First turn",
        "Mocked response",
        "Second turn",
    ]
    assert len(state.values["messages"]) == 4


def test_context_budget_keeps_tool_pairs_or_compacts_oversized_latest_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "custom_agent_context_max_messages", 4)
    monkeypatch.setattr(settings, "custom_agent_context_max_chars", 200)
    messages = [
        HumanMessage(content="Old turn"),
        AIMessage(content="Old answer"),
        HumanMessage(content="Current question"),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "get_document_details",
                    "args": {"document_id": 1},
                    "id": "tool-1",
                    "type": "tool_call",
                }
            ],
        ),
        ToolMessage(
            content="Private tool result",
            name="get_document_details",
            tool_call_id="tool-1",
        ),
        AIMessage(content="Current answer"),
    ]
    bounded = _bounded_history(messages)
    assert [message.type for message in bounded] == ["human", "ai", "tool", "ai"]
    assert bounded[1].tool_calls[0]["id"] == bounded[2].tool_call_id
    assert bounded[0].content == "Current question"

    monkeypatch.setattr(settings, "custom_agent_context_max_chars", 30)
    oversized = _bounded_history(
        [
            HumanMessage(content="question " * 20),
            messages[3],
            ToolMessage(
                content="result " * 20,
                name="get_document_details",
                tool_call_id="tool-1",
            ),
            AIMessage(content="answer " * 20),
        ]
    )
    assert [message.type for message in oversized] == ["human", "ai"]
    assert sum(len(str(message.content)) for message in oversized) <= 30
    assert all(not getattr(message, "tool_calls", None) for message in oversized)

    oversized_block = _bounded_history(
        [
            HumanMessage(content="Question"),
            ToolMessage(
                content=[{"type": "image", "data": "x" * 100}],
                name="document_preview",
                tool_call_id="tool-2",
            ),
            AIMessage(content="Answer"),
        ]
    )
    assert [message.type for message in oversized_block] == ["human", "ai"]


@pytest.mark.parametrize(
    ("provider", "model_name", "key_setting"),
    [
        ("groq", DEFAULT_AGENT_MODEL, "groq_api_key"),
        ("openai", "gpt-5.6-sol", "openai_api_key"),
        ("anthropic", "claude-haiku-4-5-20251001", "anthropic_api_key"),
        ("google", "gemini-4-hydrogen", "google_api_key"),
    ],
)
def test_dynamic_factory_routes_each_provider_through_the_registry(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
    monkeypatch: pytest.MonkeyPatch,
    provider: str,
    model_name: str,
    key_setting: str,
) -> None:
    monkeypatch.setattr(settings, key_setting, f"test-{provider}-key")
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        model_provider=provider,
        model_name=model_name,
    )

    build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
    )

    assert fake_chat_models[0].parameters["provider"] == provider
    assert fake_chat_models[0].parameters["model"] == model_name


def test_each_agent_supplies_its_own_system_prompt(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    first = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        system_prompt="Answer in concise bullet points.",
        enabled_tools=[],
    )
    second = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        system_prompt="Explain each answer step by step.",
        enabled_tools=[],
    )

    for agent in (first, second):
        graph = build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )
        invoke_as_user(graph, agent_factory_database.owner.id, "Explain this")

    first_system = fake_chat_models[0].messages[0].content
    second_system = fake_chat_models[1].messages[0].content
    assert first_system == "Answer in concise bullet points."
    assert second_system == "Explain each answer step by step."
    assert first_system != second_system


def test_each_agent_binds_only_its_saved_tools(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    first = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=["get_document_details"],
    )
    second = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=["search_web"],
    )

    build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        first.id,
    )
    build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        second.id,
    )

    assert [tool.name for tool in fake_chat_models[0].bound_tools or []] == [
        "get_document_details"
    ]
    assert [tool.name for tool in fake_chat_models[1].bound_tools or []] == [
        "search_web"
    ]


def test_agent_without_tools_compiles_without_a_tool_node(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=[],
    )

    graph = build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
    )
    invoke_as_user(graph, agent_factory_database.owner.id)

    assert fake_chat_models[0].bound_tools is None
    assert "tools" not in graph.get_graph().nodes


def test_custom_agent_graph_streams_provider_chunks_incrementally(
    agent_factory_database: AgentFactoryDatabase,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=[],
    )
    model = StreamingFakeChatModel()
    monkeypatch.setattr(factory, "create_chat_model", lambda *_args, **_kwargs: model)
    graph = build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
    )
    user_token = current_user_id.set(agent_factory_database.owner.id)
    try:
        chunks = []
        final_messages = []
        for mode, payload in graph.stream(
            {"messages": [HumanMessage(content="Write an answer")]},
            stream_mode=["custom", "messages", "updates"],
        ):
            if mode == "custom":
                if payload.get("cognivault_event") == "text_delta":
                    chunks.append(payload["text"])
                continue
            if mode == "updates":
                final_messages.extend(payload.get("chatbot", {}).get("messages", []))
    finally:
        current_user_id.reset(user_token)

    assert chunks == ["Incremental ", "custom response."]
    assert not any(
        "private reasoning" in str(message.content) for message in final_messages
    )


def test_streamed_model_tool_calls_still_execute_through_authorized_tool_node(
    agent_factory_database: AgentFactoryDatabase,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    document = Document(
        user_id=agent_factory_database.owner.id,
        filename="streamed-owned.pdf",
        status="completed",
    )
    agent_factory_database.session.add(document)
    agent_factory_database.session.commit()
    agent_factory_database.session.refresh(document)
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=["get_document_details"],
    )
    model = StreamingFakeToolCallingModel()
    monkeypatch.setattr(factory, "create_chat_model", lambda *_args, **_kwargs: model)
    monkeypatch.setattr(
        agent_tools,
        "SessionLocal",
        agent_factory_database.session_factory,
    )
    graph = build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
    )

    result = invoke_as_user(graph, agent_factory_database.owner.id)
    tool_messages = [
        message for message in result["messages"] if message.type == "tool"
    ]

    assert model.invocation_count == 2
    assert len(tool_messages) == 1
    assert "streamed-owned.pdf" in tool_messages[0].content
    assert result["messages"][-1].content == "The file is completed."


def test_request_document_context_is_preserved_in_agent_prompt(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=[],
    )
    token = current_document_context.set("- research.pdf (document_id=7)")
    user_token = current_user_id.set(agent_factory_database.owner.id)
    try:
        graph = build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )
        invoke_as_user(
            graph,
            agent_factory_database.owner.id,
            "Summarize my file",
        )
    finally:
        current_document_context.reset(token)
        current_user_id.reset(user_token)

    messages = fake_chat_models[0].messages
    system_messages = [
        message.content for message in messages if isinstance(message, SystemMessage)
    ]
    assert any("research.pdf (document_id=7)" in content for content in system_messages)
    assert SECURITY_POLICY in system_messages[-1]


def test_compiled_agent_rejects_foreign_request_context(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=[],
    )
    graph = build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
    )
    token = current_user_id.set(agent_factory_database.other_user.id)
    try:
        with pytest.raises(AgentExecutionContextError):
            graph.invoke({"messages": [HumanMessage(content="Try another user")]})
    finally:
        current_user_id.reset(token)

    assert fake_chat_models[0].messages is None


def test_compiled_agent_rejects_missing_request_context(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=[],
    )
    graph = build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
    )

    with pytest.raises(AgentExecutionContextError):
        graph.invoke({"messages": [HumanMessage(content="No identity")]})

    assert fake_chat_models[0].messages is None


def test_document_tools_enforce_owner_when_model_requests_foreign_document(
    agent_factory_database: AgentFactoryDatabase,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    foreign_document = Document(
        user_id=agent_factory_database.other_user.id,
        filename="private.pdf",
    )
    agent_factory_database.session.add(foreign_document)
    agent_factory_database.session.commit()
    agent_factory_database.session.refresh(foreign_document)

    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=["get_document_details"],
    )
    mocked_model = FakeToolCallingChatModel(foreign_document.id)
    monkeypatch.setattr(
        factory, "create_chat_model", lambda *_args, **_kwargs: mocked_model
    )
    monkeypatch.setattr(
        agent_tools,
        "SessionLocal",
        agent_factory_database.session_factory,
    )

    graph = build_agent_for_user(
        agent_factory_database.session,
        agent_factory_database.owner,
        agent.id,
    )
    result = invoke_as_user(graph, agent_factory_database.owner.id)

    tool_results = [
        message.content for message in result["messages"] if message.type == "tool"
    ]
    assert tool_results == [f"Document {foreign_document.id} was not found."]
    assert result["messages"][-1].content == "Mocked response after tool call"


def test_inactive_agents_are_rejected_before_model_construction(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        is_active=False,
    )

    with pytest.raises(InactiveAgentError):
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )

    assert fake_chat_models == []


def test_other_users_cannot_construct_an_agent(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
    )

    with pytest.raises(HTTPException) as error:
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.other_user,
            agent.id,
        )

    assert error.value.status_code == 404
    assert fake_chat_models == []


@pytest.mark.parametrize(
    "override",
    [
        {"model_provider": "python"},
        {"model_name": "unapproved-model"},
        {"temperature": 2.1},
        {"system_prompt": "   "},
        {"enabled_tools": ["get_document_details", "get_document_details"]},
    ],
)
def test_invalid_persisted_configuration_is_rejected(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
    override: dict[str, object],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        **override,
    )

    with pytest.raises(InvalidAgentConfigurationError):
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )

    assert fake_chat_models == []


def test_unallowlisted_persisted_tool_is_rejected(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=["run_python"],
    )

    with pytest.raises(InvalidAgentConfigurationError):
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )

    assert fake_chat_models == []


def test_saved_tool_missing_from_current_registry_is_rejected(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=["get_document_details"],
    )
    monkeypatch.setattr(
        factory,
        "TOOL_REGISTRY",
        ToolRegistry(
            [
                TOOL_REGISTRY.get_registration(name)
                for name in TOOL_REGISTRY.names()
                if name != "get_document_details"
            ]
        ),
    )

    with pytest.raises(InvalidAgentConfigurationError):
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )

    assert fake_chat_models == []


def test_web_tool_is_unavailable_without_tavily_configuration(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=["search_web"],
    )
    monkeypatch.setattr(settings, "tavily_api_key", "")

    with pytest.raises(UnavailableAgentToolError):
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )

    assert fake_chat_models == []


def test_agent_construction_rejects_missing_server_groq_key(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
    )
    monkeypatch.setattr(settings, "groq_api_key", "")

    with pytest.raises(UnavailableAgentProviderError):
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )

    assert fake_chat_models == []


@pytest.mark.parametrize(
    "capability",
    ["memory_enabled", "human_approval_required"],
)
def test_unimplemented_capabilities_fail_closed(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
    capability: str,
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        **{capability: True},
    )

    with pytest.raises(UnsupportedAgentCapabilityError):
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )

    assert fake_chat_models == []


def test_document_deletion_tool_is_unavailable_without_approval_resume(
    agent_factory_database: AgentFactoryDatabase,
    fake_chat_models: list[FakeChatModel],
) -> None:
    agent = save_agent(
        agent_factory_database.session,
        agent_factory_database.owner,
        enabled_tools=["delete_document"],
    )

    with pytest.raises(UnsupportedAgentCapabilityError):
        build_agent_for_user(
            agent_factory_database.session,
            agent_factory_database.owner,
            agent.id,
        )

    assert fake_chat_models == []

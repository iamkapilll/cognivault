"""Custom-agent execution tests with local fake LangGraph graphs."""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from typing import Any

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage
from langgraph.errors import GraphRecursionError

from app.core.context import (
    current_document_context,
    current_document_ids,
    current_user_id,
)
from app.schemas import AgentInvokeRequest
from app.services.agent_execution import (
    AgentRunRecursionError,
    AgentRunTimeoutError,
    PreparedAgentExecution,
    _invoke_in_context,
    invoke_agent,
    stream_agent_events,
)


class FakeGraph:
    def __init__(self, *, answer: str = "A safe answer.") -> None:
        self.answer = answer
        self.observed: list[tuple[int | None, tuple[int, ...], str, object]] = []

    def invoke(self, payload: dict[str, Any], *, config: dict[str, Any]) -> dict:
        self.observed.append(
            (
                current_user_id.get(),
                current_document_ids.get(),
                current_document_context.get(),
                config,
            )
        )
        assert isinstance(payload["messages"][0], HumanMessage)
        return {"messages": [*payload["messages"], AIMessage(content=self.answer)]}

    def stream(
        self,
        _payload: dict[str, Any],
        *,
        config: dict[str, Any],
        stream_mode: list[str],
    ) -> Iterator[tuple[str, Any]]:
        self.observed.append(
            (
                current_user_id.get(),
                current_document_ids.get(),
                current_document_context.get(),
                (config, stream_mode),
            )
        )
        yield "custom", {"cognivault_event": "text_delta", "text": "A clear "}
        yield "custom", {"cognivault_event": "text_delta", "text": "answer."}
        yield (
            "messages",
            (
                AIMessageChunk(content="private reasoning must not be forwarded"),
                {"langgraph_node": "chatbot"},
            ),
        )
        yield (
            "messages",
            (
                AIMessageChunk(content="private tool result"),
                {"langgraph_node": "tools"},
            ),
        )
        yield (
            "updates",
            {
                "chatbot": {
                    "messages": [
                        AIMessage(
                            content="",
                            tool_calls=[
                                {
                                    "name": "search_documents",
                                    "args": {"query": "private argument"},
                                    "id": "call-1",
                                    "type": "tool_call",
                                }
                            ],
                        )
                    ]
                }
            },
        )
        yield (
            "updates",
            {
                "tools": {
                    "messages": [
                        ToolMessage(
                            content="private tool result",
                            name="search_documents",
                            tool_call_id="call-1",
                        )
                    ]
                }
            },
        )
        yield "updates", {"chatbot": {"messages": [AIMessage(content=self.answer)]}}


def make_run(
    graph: Any | None = None,
    *,
    user_id: int = 17,
    message: str = "Summarize my file",
    document_ids: tuple[int, ...] = (3,),
    timeout: int = 2,
) -> PreparedAgentExecution:
    return PreparedAgentExecution(
        graph=graph or FakeGraph(),
        run_id=f"run-{user_id}",
        agent_id=9,
        user_id=user_id,
        message=message,
        document_ids=document_ids,
        document_context=f"owned document {document_ids}",
        enabled_tool_names=frozenset({"search_documents"}),
        timeout_seconds=timeout,
        recursion_limit=7,
        max_concurrency=2,
    )


def test_invoke_sets_trusted_context_and_restores_previous_context() -> None:
    graph = FakeGraph(answer="Response without tool output")
    run = make_run(graph)
    user_token = current_user_id.set(88)
    document_token = current_document_ids.set((42,))
    context_token = current_document_context.set("outer context")
    try:
        response = _invoke_in_context(run)
        assert response.response == "Response without tool output"
        assert graph.observed == [
            (
                17,
                (3,),
                "owned document (3,)",
                {"recursion_limit": 7, "max_concurrency": 2},
            )
        ]
        assert current_user_id.get() == 88
        assert current_document_ids.get() == (42,)
        assert current_document_context.get() == "outer context"
    finally:
        current_document_context.reset(context_token)
        current_document_ids.reset(document_token)
        current_user_id.reset(user_token)


def test_stream_emits_incremental_text_without_reasoning_or_tool_data() -> None:
    run = make_run(FakeGraph())
    events = list(stream_agent_events(run, threading.Event()))

    assert [event.type for event in events] == [
        "run_started",
        "text_delta",
        "text_delta",
        "tool_started",
        "tool_completed",
        "run_completed",
    ]
    assert "".join(event.text for event in events if event.type == "text_delta") == (
        "A clear answer."
    )
    serialized = " ".join(event.model_dump_json() for event in events)
    assert "hidden reasoning" not in serialized
    assert "private argument" not in serialized
    assert "private tool result" not in serialized
    assert "search_documents" in serialized
    assert "answer." not in events[-1].model_dump_json()


def test_cancelled_stream_does_not_emit_completion() -> None:
    cancelled = threading.Event()
    events = stream_agent_events(make_run(), cancelled)

    assert next(events).type == "run_started"
    assert next(events).type == "text_delta"
    cancelled.set()
    with pytest.raises(StopIteration):
        next(events)


def test_graph_recursion_limit_is_sanitized_for_invoke() -> None:
    class RecursionGraph(FakeGraph):
        def invoke(self, *_args: object, **_kwargs: object) -> dict:
            raise GraphRecursionError("private stack details")

    with pytest.raises(AgentRunRecursionError) as error:
        _invoke_in_context(make_run(RecursionGraph()))

    assert "private stack details" not in str(error.value)


def test_stream_graph_errors_are_sanitized() -> None:
    class FailureGraph(FakeGraph):
        def stream(
            self,
            *_args: object,
            **_kwargs: object,
        ) -> Iterator[tuple[str, Any]]:
            raise RuntimeError("secret key private prompt")
            yield "unreachable", None

    events = list(stream_agent_events(make_run(FailureGraph()), threading.Event()))

    assert events[-1].type == "error"
    assert events[-1].code == "execution_failed"
    assert "secret key" not in events[-1].model_dump_json()
    assert "private prompt" not in events[-1].model_dump_json()


def test_invoke_deadline_returns_timeout_without_waiting_for_blocked_graph() -> None:
    completed = threading.Event()

    class SlowGraph(FakeGraph):
        def invoke(self, *_args: object, **_kwargs: object) -> dict:
            time.sleep(0.1)
            completed.set()
            return {"messages": [AIMessage(content="late answer")]}

    with pytest.raises(AgentRunTimeoutError):
        invoke_agent(make_run(SlowGraph(), timeout=0))

    assert completed.wait(1)


def test_concurrent_invocations_do_not_leak_context_between_users() -> None:
    barrier = threading.Barrier(2)

    class ConcurrentGraph(FakeGraph):
        def invoke(self, *_args: object, **_kwargs: object) -> dict:
            barrier.wait(timeout=1)
            self.observed.append(
                (
                    current_user_id.get(),
                    current_document_ids.get(),
                    current_document_context.get(),
                    None,
                )
            )
            return {"messages": [AIMessage(content="isolated")]}

    first_graph = ConcurrentGraph()
    second_graph = ConcurrentGraph()
    first = make_run(first_graph, user_id=101, document_ids=(11,))
    second = make_run(second_graph, user_id=202, document_ids=(22,))
    results: list[str] = []
    errors: list[Exception] = []

    def run(run_data: PreparedAgentExecution) -> None:
        try:
            results.append(invoke_agent(run_data).response)
        except Exception as error:  # noqa: BLE001 - assert worker failure in main thread
            errors.append(error)

    threads = [threading.Thread(target=run, args=(item,)) for item in (first, second)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=2)

    assert not errors
    assert results == ["isolated", "isolated"]
    assert first_graph.observed[0][:3] == (101, (11,), "owned document (11,)")
    assert second_graph.observed[0][:3] == (202, (22,), "owned document (22,)")


def test_request_schema_rejects_blank_and_duplicate_document_inputs() -> None:
    with pytest.raises(ValueError):
        AgentInvokeRequest(message="   ")
    with pytest.raises(ValueError):
        AgentInvokeRequest(message="question", document_ids=[2, 2])

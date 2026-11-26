"""Execution lifecycle for owner-scoped, stateless custom agents."""

from __future__ import annotations

import queue
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from uuid import uuid4

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.errors import GraphRecursionError
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.factory import build_agent_for_user
from app.core.config import settings
from app.core.context import (
    current_document_context,
    current_document_ids,
    current_user_id,
)
from app.models import Agent, Document, User
from app.schemas import (
    AgentExecutionErrorEvent,
    AgentInvokeRequest,
    AgentInvokeResponse,
    AgentRunCompletedEvent,
    AgentRunStartedEvent,
    AgentStreamEvent,
    AgentTextDeltaEvent,
    AgentToolCompletedEvent,
    AgentToolStartedEvent,
)
from app.services.agents import get_owned_agent
from app.services.conversations import validate_document_ids


class AgentRunError(RuntimeError):
    """Sanitized, expected failure while running a custom agent."""


class AgentRunTimeoutError(AgentRunError):
    """The configured run deadline elapsed."""


class AgentRunRecursionError(AgentRunError):
    """LangGraph stopped the run at its configured step limit."""


class AgentRunFailedError(AgentRunError):
    """A provider or tool failed without exposing its internal details."""


@dataclass(frozen=True)
class PreparedAgentExecution:
    """Prepared graph and immutable trusted context for one request."""

    graph: CompiledStateGraph
    run_id: str
    agent_id: int
    user_id: int
    message: str
    document_ids: tuple[int, ...]
    document_context: str
    enabled_tool_names: frozenset[str]
    timeout_seconds: int
    recursion_limit: int
    max_concurrency: int


def _document_context(db: Session, user_id: int, document_ids: list[int]) -> str:
    """Use only already-authorized rows to form untrusted document labels."""

    if not document_ids:
        return ""

    rows = db.execute(
        select(Document.id, Document.filename).where(
            Document.user_id == user_id,
            Document.id.in_(document_ids),
        )
    ).all()
    return "\n".join(
        f"- {filename} (document_id={document_id})" for document_id, filename in rows
    )


def prepare_agent_execution(
    db: Session,
    user: User,
    agent_id: int,
    data: AgentInvokeRequest,
) -> PreparedAgentExecution:
    """Validate ownership and persisted settings before compiling the graph."""

    # Keep the explicit lookup here for clear execution semantics; the factory
    # repeats owner-scoped retrieval and persisted-config validation immediately
    # before it binds any model or tools.
    agent: Agent = get_owned_agent(db, user, agent_id)
    document_ids = validate_document_ids(db, user, data.document_ids)
    graph = build_agent_for_user(db, user, agent.id)
    names = agent.enabled_tools
    if not isinstance(names, list) or any(not isinstance(name, str) for name in names):
        # The factory already rejects this persisted shape. Keep the execution
        # object defensively typed if the registry behavior changes in future.
        raise AgentRunFailedError("The agent configuration is invalid.")

    return PreparedAgentExecution(
        graph=graph,
        run_id=str(uuid4()),
        agent_id=agent.id,
        user_id=user.id,
        message=data.message,
        document_ids=tuple(document_ids),
        document_context=_document_context(db, user.id, document_ids),
        enabled_tool_names=frozenset(names),
        timeout_seconds=settings.custom_agent_execution_timeout_seconds,
        recursion_limit=settings.custom_agent_recursion_limit,
        max_concurrency=settings.custom_agent_max_concurrency,
    )


@contextmanager
def _trusted_request_context(run: PreparedAgentExecution):
    """Set and always restore identity/document ContextVars for this run."""

    tokens = (
        current_user_id.set(run.user_id),
        current_document_ids.set(run.document_ids),
        current_document_context.set(run.document_context),
    )
    try:
        yield
    finally:
        # ContextVars are isolated per worker thread/task, and token reset keeps
        # subsequent runs from inheriting any identity or document selection.
        current_document_context.reset(tokens[2])
        current_document_ids.reset(tokens[1])
        current_user_id.reset(tokens[0])


def _runtime_config(run: PreparedAgentExecution) -> dict[str, object]:
    return {
        "recursion_limit": run.recursion_limit,
        "max_concurrency": run.max_concurrency,
    }


def _message_text(content: object) -> str:
    """Extract user-facing text only; thinking/reasoning blocks are excluded."""

    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return ""


def _assistant_answer(state: object) -> str:
    if not isinstance(state, dict):
        return ""
    messages = state.get("messages", [])
    if not isinstance(messages, list):
        return ""
    for message in reversed(messages):
        if isinstance(message, AIMessage) and not message.tool_calls:
            return _message_text(message.content).strip()
    return ""


def _invoke_in_context(run: PreparedAgentExecution) -> AgentInvokeResponse:
    try:
        with _trusted_request_context(run):
            state = run.graph.invoke(
                {"messages": [HumanMessage(content=run.message)]},
                config=_runtime_config(run),
            )
        answer = _assistant_answer(state)
        if not answer:
            raise AgentRunFailedError("The agent returned no assistant response.")
        return AgentInvokeResponse(
            run_id=run.run_id,
            agent_id=run.agent_id,
            response=answer,
        )
    except GraphRecursionError:
        raise AgentRunRecursionError(
            "The agent reached its configured step limit."
        ) from None
    except AgentRunError:
        raise
    except Exception:  # noqa: BLE001 - keep provider/tool details out of responses
        # Provider and tool exceptions may include prompts, inputs, URLs, or
        # credentials, so only the generic error crosses this boundary.
        raise AgentRunFailedError(
            "The agent could not complete this request."
        ) from None


def invoke_agent(run: PreparedAgentExecution) -> AgentInvokeResponse:
    """Run synchronous graph code off the request worker's deadline path.

    SDK-level request timeouts are also configured in the model registry. Python
    cannot forcibly stop an already-running synchronous SDK/tool call, so a timed
    out daemon worker may finish cleanup in the background.
    """

    result_queue: queue.Queue[tuple[bool, object]] = queue.Queue(maxsize=1)
    cancelled = threading.Event()

    def worker() -> None:
        try:
            value: object = _invoke_in_context(run)
            outcome = (True, value)
        except AgentRunError as exc:
            outcome = (False, exc)
        if not cancelled.is_set():
            try:
                result_queue.put_nowait(outcome)
            except queue.Full:
                pass

    thread = threading.Thread(target=worker, name="custom-agent-run", daemon=True)
    thread.start()
    try:
        succeeded, value = result_queue.get(timeout=run.timeout_seconds)
    except queue.Empty:
        cancelled.set()
        raise AgentRunTimeoutError("The agent execution timed out.") from None

    if succeeded and isinstance(value, AgentInvokeResponse):
        return value
    if isinstance(value, AgentRunError):
        raise value
    raise AgentRunFailedError("The agent could not complete this request.") from None


def _tool_calls(message: object, allowed: frozenset[str]) -> list[tuple[str, str]]:
    if not isinstance(message, AIMessage):
        return []
    calls = []
    for call in message.tool_calls:
        name = call.get("name")
        call_id = call.get("id")
        if isinstance(name, str) and name in allowed and isinstance(call_id, str):
            calls.append((call_id, name))
    return calls


def stream_agent_events(
    run: PreparedAgentExecution,
    cancelled: threading.Event,
) -> Iterator[AgentStreamEvent]:
    """Yield a safe SSE event sequence from LangGraph's incremental stream."""

    yield AgentRunStartedEvent(run_id=run.run_id, agent_id=run.agent_id)
    tool_calls: dict[str, str] = {}
    streamed_text = False
    final_answer = ""
    try:
        with _trusted_request_context(run):
            graph_stream = run.graph.stream(
                {"messages": [HumanMessage(content=run.message)]},
                config=_runtime_config(run),
                stream_mode=["custom", "messages", "updates"],
            )
            for mode, payload in graph_stream:
                if cancelled.is_set():
                    return

                if mode == "custom":
                    if (
                        isinstance(payload, dict)
                        and payload.get("cognivault_event") == "text_delta"
                        and isinstance(payload.get("text"), str)
                        and payload["text"]
                    ):
                        streamed_text = True
                        yield AgentTextDeltaEvent(
                            run_id=run.run_id,
                            text=payload["text"],
                        )
                    continue

                # LangGraph's messages mode includes the aggregated return value
                # from the node; emitting it would duplicate custom text deltas.
                if mode == "messages":
                    continue

                if mode != "updates" or not isinstance(payload, dict):
                    continue

                chatbot_update = payload.get("chatbot")
                if isinstance(chatbot_update, dict):
                    messages = chatbot_update.get("messages", [])
                    if isinstance(messages, list):
                        for message in messages:
                            if (
                                isinstance(message, AIMessage)
                                and not message.tool_calls
                            ):
                                final_answer = _message_text(message.content).strip()
                            for call_id, name in _tool_calls(
                                message, run.enabled_tool_names
                            ):
                                if call_id not in tool_calls:
                                    tool_calls[call_id] = name
                                    yield AgentToolStartedEvent(
                                        run_id=run.run_id,
                                        tool_name=name,
                                    )

                tools_update = payload.get("tools")
                if isinstance(tools_update, dict):
                    messages = tools_update.get("messages", [])
                    if isinstance(messages, list):
                        for message in messages:
                            if not isinstance(message, ToolMessage):
                                continue
                            name = tool_calls.pop(message.tool_call_id, None)
                            if name is None and message.name in run.enabled_tool_names:
                                name = message.name
                            if name:
                                yield AgentToolCompletedEvent(
                                    run_id=run.run_id,
                                    tool_name=name,
                                )

        if cancelled.is_set():
            return
        # Providers with streaming disabled by a proxy/integration still get a
        # single text event. Never send both chunks and the complete answer.
        if not streamed_text and final_answer:
            yield AgentTextDeltaEvent(run_id=run.run_id, text=final_answer)
        yield AgentRunCompletedEvent(run_id=run.run_id)
    except GraphRecursionError:
        if not cancelled.is_set():
            yield AgentExecutionErrorEvent(
                run_id=run.run_id,
                code="recursion_limit_exceeded",
                message="The agent reached its configured step limit.",
            )
    except Exception:  # noqa: BLE001 - streaming failures are sanitized below
        if not cancelled.is_set():
            yield AgentExecutionErrorEvent(
                run_id=run.run_id,
                code="execution_failed",
                message="The agent could not complete this request.",
            )

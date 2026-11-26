"""Execution lifecycle for owner-scoped custom agents."""

from __future__ import annotations

import queue
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.errors import GraphRecursionError
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.factory import build_agent_for_user
from app.core.config import settings
from app.core.context import (
    current_document_context,
    current_document_ids,
    current_user_id,
)
from app.database import SessionLocal
from app.models import Agent, AgentApproval, Conversation, Document, User
from app.schemas import (
    AgentApprovalRejectedEvent,
    AgentApprovalRequiredEvent,
    AgentApprovalSummary,
    AgentExecutionErrorEvent,
    AgentInvokePendingResponse,
    AgentInvokeRequest,
    AgentInvokeResponse,
    AgentInvokeResult,
    AgentRunCompletedEvent,
    AgentRunPausedEvent,
    AgentRunResumedEvent,
    AgentRunStartedEvent,
    AgentStreamEvent,
    AgentTextDeltaEvent,
    AgentToolCompletedEvent,
    AgentToolStartedEvent,
)
from app.services.agent_approvals import (
    as_utc,
    public_action_summary,
    write_audit_event,
)
from app.services.agent_conversations import get_owned_agent_conversation
from app.services.agent_guardrails import filter_sensitive_output, validate_user_input
from app.services.agents import get_owned_agent
from app.services.conversations import (
    conversation_document_ids,
    lock_conversations,
    validate_document_ids,
)


class AgentRunError(RuntimeError):
    """Sanitized, expected failure while running a custom agent."""


class AgentRunTimeoutError(AgentRunError):
    """The configured run deadline elapsed."""


class AgentRunRecursionError(AgentRunError):
    """LangGraph stopped the run at its configured step limit."""


class AgentRunFailedError(AgentRunError):
    """A provider or tool failed without exposing its internal details."""


class AgentRunCheckpointerUnavailableError(AgentRunError):
    """Persistent execution has no lifespan-owned application checkpointer."""


class AgentRunConversationAccessError(AgentRunError):
    """The conversation changed or became inaccessible before execution."""


class AgentRunInactiveError(AgentRunError):
    """The saved agent was disabled before the run acquired its execution lock."""


class AgentRunIncompleteConversationError(AgentRunError):
    """A prior graph run left pending work; appending another turn is unsafe."""


@dataclass(frozen=True)
class PreparedAgentExecution:
    """Prepared graph and immutable trusted context for one request."""

    graph: CompiledStateGraph
    run_id: str
    agent_id: int
    user_id: int
    message: str
    conversation_id: int | None
    thread_id: str | None
    document_ids: tuple[int, ...]
    document_context: str
    enabled_tool_names: frozenset[str]
    timeout_seconds: int
    recursion_limit: int
    max_concurrency: int
    resume_approval_id: UUID | None = None
    resume_decision: str | None = None


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
    *,
    checkpointer: BaseCheckpointSaver | None = None,
) -> PreparedAgentExecution:
    """Validate ownership and persisted settings before compiling the graph."""

    try:
        message = validate_user_input(data.message)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None

    # Keep the explicit lookup here for clear execution semantics; the factory
    # repeats owner-scoped retrieval and persisted-config validation immediately
    # before it binds any model or tools.
    agent: Agent = get_owned_agent(db, user, agent_id)
    conversation: Conversation | None = None
    if agent.memory_enabled is True:
        if data.conversation_id is None:
            raise HTTPException(
                status_code=422,
                detail="A conversation_id is required for this memory-enabled agent.",
            )
        if checkpointer is None:
            raise AgentRunCheckpointerUnavailableError(
                "The application checkpointer is unavailable."
            )
        conversation = get_owned_agent_conversation(
            db,
            user,
            agent.id,
            data.conversation_id,
        )
        selected_document_ids = (
            conversation_document_ids(conversation)
            if data.document_ids is None
            else data.document_ids
        )
    else:
        if data.conversation_id is not None:
            raise HTTPException(
                status_code=422,
                detail="Stateless agents cannot use conversation identifiers.",
            )
        selected_document_ids = data.document_ids or []

    # Ownership checks must happen before model/provider initialization or tool
    # binding, including for memory-backed runs whose documents come from the
    # conversation's saved defaults.
    document_ids = validate_document_ids(db, user, selected_document_ids)

    if conversation is not None:
        graph = build_agent_for_user(
            db,
            user,
            agent.id,
            checkpointer=checkpointer,
        )
    else:
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
        message=message,
        conversation_id=conversation.id if conversation is not None else None,
        thread_id=conversation.thread_id if conversation is not None else None,
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
    config: dict[str, object] = {
        "recursion_limit": run.recursion_limit,
        "max_concurrency": run.max_concurrency,
    }
    if run.thread_id is not None:
        config["configurable"] = {
            "thread_id": run.thread_id,
            "run_id": run.run_id,
            "agent_id": run.agent_id,
            "user_id": run.user_id,
            "conversation_id": run.conversation_id,
            "document_ids": list(run.document_ids),
        }
    return config


def _verify_locked_conversation(db: Session, run: PreparedAgentExecution) -> None:
    if run.conversation_id is None or run.thread_id is None:
        raise AgentRunConversationAccessError("Conversation not found.")
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == run.conversation_id,
            Conversation.user_id == run.user_id,
            Conversation.agent_id == run.agent_id,
            Conversation.thread_id == run.thread_id,
        )
    )
    if conversation is None:
        raise AgentRunConversationAccessError("Conversation not found.")


def _lock_active_agent(db: Session, run: PreparedAgentExecution) -> None:
    """Use the same agent-before-conversation lock order as agent deletion."""

    agent = db.scalar(
        select(Agent)
        .where(Agent.id == run.agent_id, Agent.user_id == run.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if agent is None:
        raise AgentRunConversationAccessError("Agent not found.")
    if agent.is_active is not True:
        raise AgentRunInactiveError("This agent is inactive.")


def _ensure_no_pending_checkpoint(run: PreparedAgentExecution) -> None:
    if run.thread_id is None:
        return
    snapshot = run.graph.get_state(_runtime_config(run))
    if getattr(snapshot, "next", ()):
        raise AgentRunIncompleteConversationError(
            "This conversation has unfinished work. Start a new conversation."
        )


def _pending_interrupt_values(run: PreparedAgentExecution) -> list[dict[str, object]]:
    if run.thread_id is None:
        return []
    snapshot = run.graph.get_state(_runtime_config(run))
    found: list[dict[str, object]] = []
    for task in getattr(snapshot, "tasks", ()):
        for item in getattr(task, "interrupts", ()):
            value = getattr(item, "value", None)
            if isinstance(value, dict):
                found.append(value)
    return found


def _ensure_pending_approval_checkpoint(
    run: PreparedAgentExecution,
    approval_id: UUID,
) -> None:
    expected = str(approval_id)
    if not any(
        value.get("approval_id") == expected for value in _pending_interrupt_values(run)
    ):
        raise AgentRunIncompleteConversationError(
            "This approval is not pending in the owned conversation."
        )


def prepare_agent_resume(
    db: Session,
    user: User,
    agent_id: int,
    approval: AgentApproval,
    *,
    decision: str,
    checkpointer: BaseCheckpointSaver,
) -> PreparedAgentExecution:
    """Build a fresh owner-scoped graph only for its matching saved interrupt."""

    if decision not in {"approve", "reject"}:
        raise AgentRunConversationAccessError("The approval decision is invalid.")
    agent = get_owned_agent(db, user, agent_id)
    if agent.is_active is not True:
        raise HTTPException(status_code=409, detail="This agent is inactive.")
    expected_status = "approved" if decision == "approve" else "rejected"
    if approval.status != expected_status and not (
        decision == "reject" and approval.status == "expired"
    ):
        raise HTTPException(status_code=409, detail="Approval is not ready to resume.")
    expires_at = as_utc(approval.expires_at)
    if decision == "approve" and expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=409, detail="Approval has expired.")

    conversation = get_owned_agent_conversation(
        db,
        user,
        agent_id,
        approval.conversation_id,
    )
    if conversation.id != approval.conversation_id or agent.id != approval.agent_id:
        raise AgentRunConversationAccessError("Conversation not found.")
    document_ids = validate_document_ids(
        db,
        user,
        list(approval.context_document_ids),
    )
    graph = build_agent_for_user(db, user, agent.id, checkpointer=checkpointer)
    names = agent.enabled_tools
    if not isinstance(names, list) or any(not isinstance(name, str) for name in names):
        raise AgentRunFailedError("The agent configuration is invalid.")
    run = PreparedAgentExecution(
        graph=graph,
        run_id=approval.run_id,
        agent_id=agent.id,
        user_id=user.id,
        message="",
        conversation_id=conversation.id,
        thread_id=conversation.thread_id,
        document_ids=tuple(document_ids),
        document_context=_document_context(db, user.id, document_ids),
        enabled_tool_names=frozenset(names),
        timeout_seconds=settings.custom_agent_execution_timeout_seconds,
        recursion_limit=settings.custom_agent_recursion_limit,
        max_concurrency=settings.custom_agent_max_concurrency,
        resume_approval_id=approval.id,
        resume_decision=decision,
    )
    _ensure_pending_approval_checkpoint(run, approval.id)
    return run


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


def _interrupt_approval_id(state: object) -> UUID | None:
    if not isinstance(state, dict):
        return None
    interrupts = state.get("__interrupt__", ())
    if not isinstance(interrupts, (tuple, list)):
        return None
    for item in interrupts:
        value = getattr(item, "value", None)
        if isinstance(value, dict):
            try:
                return UUID(str(value.get("approval_id")))
            except (TypeError, ValueError):
                continue
    return None


def _approval_summary(
    db: Session,
    approval: AgentApproval,
) -> AgentApprovalSummary:
    return AgentApprovalSummary(
        id=approval.id,
        agent_id=approval.agent_id,
        conversation_id=approval.conversation_id,
        run_id=approval.run_id,
        tool_name=approval.tool_name,
        status=approval.status,
        action_summary=public_action_summary(db, approval),
        created_at=approval.created_at,
        expires_at=approval.expires_at,
        decided_at=approval.decided_at,
        executed_at=approval.executed_at,
    )


def _invoke_in_context(run: PreparedAgentExecution) -> AgentInvokeResult:
    try:
        with _trusted_request_context(run):
            graph_input = (
                Command(
                    resume={
                        "approval_id": str(run.resume_approval_id),
                        "decision": run.resume_decision,
                    }
                )
                if run.resume_approval_id is not None
                else {"messages": [HumanMessage(content=run.message)]}
            )
            state = run.graph.invoke(
                graph_input,
                config=_runtime_config(run),
            )
        approval_id = _interrupt_approval_id(state)
        if approval_id is not None and run.conversation_id is not None:
            with SessionLocal() as db:
                approval = db.scalar(
                    select(AgentApproval).where(
                        AgentApproval.id == approval_id,
                        AgentApproval.user_id == run.user_id,
                        AgentApproval.agent_id == run.agent_id,
                        AgentApproval.conversation_id == run.conversation_id,
                        AgentApproval.run_id == run.run_id,
                    )
                )
                if approval is None:
                    raise AgentRunFailedError("The approval request is unavailable.")
                return AgentInvokePendingResponse(
                    run_id=run.run_id,
                    agent_id=run.agent_id,
                    conversation_id=run.conversation_id,
                    approval=_approval_summary(db, approval),
                )
        answer = _assistant_answer(state)
        if not answer:
            raise AgentRunFailedError("The agent returned no assistant response.")
        return AgentInvokeResponse(
            run_id=run.run_id,
            agent_id=run.agent_id,
            response=filter_sensitive_output(answer),
            conversation_id=run.conversation_id,
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


def invoke_agent(run: PreparedAgentExecution) -> AgentInvokeResult:
    """Run synchronous graph code off the request worker's deadline path.

    SDK-level request timeouts are also configured in the model registry. Python
    cannot forcibly stop an already-running synchronous SDK/tool call, so a timed
    out daemon worker may finish cleanup in the background.
    """

    result_queue: queue.Queue[tuple[bool, object]] = queue.Queue(maxsize=1)
    cancelled = threading.Event()

    def execute() -> AgentInvokeResult:
        if run.conversation_id is None:
            return _invoke_in_context(run)

        # This session uses the application's existing SQLAlchemy engine/pool.
        # PostgreSQL advisory locks serialize the same thread across workers.
        with SessionLocal() as db:
            _lock_active_agent(db, run)
            with lock_conversations(db, [run.conversation_id]):
                _verify_locked_conversation(db, run)
                if run.resume_approval_id is not None:
                    _ensure_pending_approval_checkpoint(run, run.resume_approval_id)
                else:
                    _ensure_no_pending_checkpoint(run)
                response = _invoke_in_context(run)
                conversation = db.get(Conversation, run.conversation_id)
                if conversation is None:
                    raise AgentRunConversationAccessError("Conversation not found.")
                conversation.updated_at = datetime.now(UTC)
                db.commit()
                return response

    def worker() -> None:
        try:
            value: object = execute()
            outcome = (True, value)
        except AgentRunError as exc:
            outcome = (False, exc)
        except Exception:  # noqa: BLE001 - sanitize unexpected provider/tool failures
            outcome = (
                False,
                AgentRunFailedError("The agent could not complete this request."),
            )
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

    if succeeded and isinstance(
        value,
        (AgentInvokeResponse, AgentInvokePendingResponse),
    ):
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


def _stream_graph_events(
    run: PreparedAgentExecution,
    cancelled: threading.Event,
) -> Iterator[AgentStreamEvent]:
    """Yield events for one graph run after any conversation lock is acquired."""

    tool_calls: dict[str, str] = {}
    streamed_text = False
    collected_text: list[str] = []
    stream_order: list[AgentStreamEvent | tuple[str, str]] = []
    final_answer = ""
    try:
        with _trusted_request_context(run):
            if run.resume_approval_id is not None:
                yield AgentRunResumedEvent(
                    run_id=run.run_id,
                    approval_id=run.resume_approval_id,
                )
                if run.resume_decision == "reject":
                    with SessionLocal() as db:
                        approval = db.get(AgentApproval, run.resume_approval_id)
                        if approval is not None and approval.status == "rejected":
                            yield AgentApprovalRejectedEvent(
                                run_id=run.run_id,
                                approval_id=run.resume_approval_id,
                                tool_name=approval.tool_name,
                            )
            graph_input = (
                Command(
                    resume={
                        "approval_id": str(run.resume_approval_id),
                        "decision": run.resume_decision,
                    }
                )
                if run.resume_approval_id is not None
                else {"messages": [HumanMessage(content=run.message)]}
            )
            graph_stream = run.graph.stream(
                graph_input,
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
                        collected_text.append(payload["text"])
                        stream_order.append(("text", payload["text"]))
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
                                    stream_order.append(
                                        AgentToolStartedEvent(
                                            run_id=run.run_id,
                                            tool_name=name,
                                        )
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
                                stream_order.append(
                                    AgentToolCompletedEvent(
                                        run_id=run.run_id,
                                        tool_name=name,
                                    )
                                )

        if cancelled.is_set():
            return
        pending_values = _pending_interrupt_values(run)
        approval_id = next(
            (
                UUID(str(value["approval_id"]))
                for value in pending_values
                if isinstance(value.get("approval_id"), str)
            ),
            None,
        )
        if approval_id is not None and run.conversation_id is not None:
            with SessionLocal() as db:
                approval = db.scalar(
                    select(AgentApproval).where(
                        AgentApproval.id == approval_id,
                        AgentApproval.user_id == run.user_id,
                        AgentApproval.agent_id == run.agent_id,
                        AgentApproval.conversation_id == run.conversation_id,
                        AgentApproval.run_id == run.run_id,
                    )
                )
                if approval is None:
                    raise AgentRunFailedError("The approval request is unavailable.")
                summary = _approval_summary(db, approval)
            yield AgentApprovalRequiredEvent(
                run_id=run.run_id,
                agent_id=run.agent_id,
                conversation_id=run.conversation_id,
                approval=summary,
            )
            yield AgentRunPausedEvent(
                run_id=run.run_id,
                approval_id=approval_id,
            )
            return
        # Providers with streaming disabled by a proxy/integration still get a
        # single text event. Delay text until the complete answer can be scanned
        # for credential-shaped values that may span provider chunks.
        original_answer = "".join(collected_text) if streamed_text else final_answer
        public_answer = filter_sensitive_output(original_answer)
        if not streamed_text and public_answer:
            stream_order.append(("text", public_answer))
        replacement_emitted = False
        for item in stream_order:
            if cancelled.is_set():
                return
            if isinstance(item, tuple):
                if public_answer == original_answer:
                    yield AgentTextDeltaEvent(run_id=run.run_id, text=item[1])
                elif not replacement_emitted and public_answer:
                    replacement_emitted = True
                    yield AgentTextDeltaEvent(run_id=run.run_id, text=public_answer)
            else:
                yield item
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


def stream_agent_events(
    run: PreparedAgentExecution,
    cancelled: threading.Event,
) -> Iterator[AgentStreamEvent]:
    """Serialize persistent runs and surface only stable, safe SSE events."""

    yield AgentRunStartedEvent(
        run_id=run.run_id,
        agent_id=run.agent_id,
        conversation_id=run.conversation_id,
    )
    if run.conversation_id is None:
        yield from _stream_graph_events(run, cancelled)
        return

    try:
        with SessionLocal() as db:
            _lock_active_agent(db, run)
            with lock_conversations(db, [run.conversation_id]):
                _verify_locked_conversation(db, run)
                if run.resume_approval_id is not None:
                    _ensure_pending_approval_checkpoint(run, run.resume_approval_id)
                    approval = db.scalar(
                        select(AgentApproval).where(
                            AgentApproval.id == run.resume_approval_id,
                            AgentApproval.user_id == run.user_id,
                            AgentApproval.agent_id == run.agent_id,
                            AgentApproval.conversation_id == run.conversation_id,
                            AgentApproval.run_id == run.run_id,
                        )
                    )
                    if approval is None:
                        raise AgentRunConversationAccessError("Approval not found.")
                    write_audit_event(
                        db,
                        user_id=run.user_id,
                        agent_id=run.agent_id,
                        conversation_id=run.conversation_id,
                        run_id=run.run_id,
                        approval_id=approval.id,
                        tool_name=approval.tool_name,
                        event_type="approval_resumed",
                        outcome=run.resume_decision or "unknown",
                    )
                else:
                    _ensure_no_pending_checkpoint(run)
                if cancelled.is_set():
                    return

                completed = False
                for event in _stream_graph_events(run, cancelled):
                    if event.type in {"run_completed", "run_paused"}:
                        conversation = db.get(Conversation, run.conversation_id)
                        if conversation is None:
                            raise AgentRunConversationAccessError(
                                "Conversation not found."
                            )
                        conversation.updated_at = datetime.now(UTC)
                        db.commit()
                        completed = True
                    yield event

                if not completed:
                    db.rollback()
    except AgentRunConversationAccessError:
        yield AgentExecutionErrorEvent(
            run_id=run.run_id,
            code="conversation_not_found",
            message="Conversation not found.",
        )
    except AgentRunInactiveError:
        yield AgentExecutionErrorEvent(
            run_id=run.run_id,
            code="agent_inactive",
            message="This agent is inactive.",
        )
    except AgentRunIncompleteConversationError:
        yield AgentExecutionErrorEvent(
            run_id=run.run_id,
            code="conversation_incomplete",
            message="This conversation has unfinished work. Start a new conversation.",
        )
    except Exception:  # noqa: BLE001 - database/checkpointer errors are sanitized
        yield AgentExecutionErrorEvent(
            run_id=run.run_id,
            code="execution_failed",
            message="The agent could not complete this request.",
        )

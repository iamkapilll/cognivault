"""Authenticated CRUD and execution endpoints for custom agent configurations."""

from __future__ import annotations

import asyncio
import queue
import threading
from datetime import UTC, datetime
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Path,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import StreamingResponse
from langgraph.checkpoint.base import BaseCheckpointSaver
from sqlalchemy.orm import Session

from app.agents.factory import (
    AgentFactoryError,
    InactiveAgentError,
    InvalidAgentConfigurationError,
    UnavailableAgentProviderError,
    UnavailableAgentToolError,
    UnsupportedAgentCapabilityError,
)
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import Conversation, User
from app.schemas import (
    AgentApprovalDecisionResponse,
    AgentApprovalListResponse,
    AgentApprovalSummary,
    AgentConversationCreate,
    AgentConversationListResponse,
    AgentConversationMessagesResponse,
    AgentConversationRename,
    AgentConversationResponse,
    AgentCreate,
    AgentExecutionErrorEvent,
    AgentInvokePendingResponse,
    AgentInvokeRequest,
    AgentInvokeResponse,
    AgentListResponse,
    AgentResponse,
    AgentStreamEvent,
    AgentUpdate,
)
from app.services.agent_approvals import (
    as_utc,
    decide_approval,
    expire_approval,
    get_owned_approval,
    list_pending_approvals,
    public_action_summary,
)
from app.services.agent_conversations import (
    checkpoint_messages,
    create_agent_conversation,
    delete_agent_conversation,
    get_owned_agent_conversation,
    list_agent_conversations,
    rename_agent_conversation,
)
from app.services.agent_execution import (
    AgentRunCheckpointerUnavailableError,
    AgentRunConversationAccessError,
    AgentRunError,
    AgentRunInactiveError,
    AgentRunIncompleteConversationError,
    AgentRunRecursionError,
    AgentRunTimeoutError,
    PreparedAgentExecution,
    invoke_agent,
    prepare_agent_execution,
    prepare_agent_resume,
    stream_agent_events,
)
from app.services.agents import (
    create_agent,
    delete_agent,
    get_owned_agent,
    list_agents,
    update_agent,
)
from app.services.conversations import conversation_document_ids, lock_conversations

router = APIRouter(prefix="/agents", tags=["Agents"])


def _factory_http_error(error: AgentFactoryError) -> HTTPException:
    """Map internal factory failures to safe, stable HTTP details."""

    if isinstance(error, InactiveAgentError):
        return HTTPException(status_code=409, detail="This agent is inactive.")
    if isinstance(error, UnsupportedAgentCapabilityError):
        return HTTPException(
            status_code=422,
            detail="This agent requests a capability that is not supported.",
        )
    if isinstance(error, InvalidAgentConfigurationError):
        return HTTPException(
            status_code=422,
            detail="The agent configuration is invalid.",
        )
    if isinstance(error, UnavailableAgentProviderError):
        return HTTPException(
            status_code=503,
            detail="The configured model provider is unavailable.",
        )
    if isinstance(error, UnavailableAgentToolError):
        return HTTPException(
            status_code=503,
            detail="One or more configured tools are unavailable.",
        )
    return HTTPException(status_code=422, detail="The agent cannot be executed.")


def _prepare_or_raise(
    db: Session,
    current_user: User,
    agent_id: int,
    data: AgentInvokeRequest,
    checkpointer: BaseCheckpointSaver | None,
) -> PreparedAgentExecution:
    try:
        return prepare_agent_execution(
            db,
            current_user,
            agent_id,
            data,
            checkpointer=checkpointer,
        )
    except AgentFactoryError as error:
        raise _factory_http_error(error) from None
    except AgentRunCheckpointerUnavailableError:
        raise HTTPException(
            status_code=503,
            detail="The application checkpointer is unavailable.",
        ) from None


def _invoke_http_error(error: AgentRunError) -> HTTPException:
    if isinstance(error, AgentRunInactiveError):
        return HTTPException(status_code=409, detail="This agent is inactive.")
    if isinstance(error, AgentRunConversationAccessError):
        return HTTPException(status_code=404, detail="Conversation not found.")
    if isinstance(error, AgentRunIncompleteConversationError):
        return HTTPException(
            status_code=409,
            detail="This conversation has unfinished work. Start a new conversation.",
        )
    if isinstance(error, AgentRunCheckpointerUnavailableError):
        return HTTPException(
            status_code=503,
            detail="The application checkpointer is unavailable.",
        )
    if isinstance(error, AgentRunTimeoutError):
        return HTTPException(status_code=504, detail="The agent execution timed out.")
    if isinstance(error, AgentRunRecursionError):
        return HTTPException(
            status_code=422,
            detail="The agent reached its configured step limit.",
        )
    return HTTPException(
        status_code=502,
        detail="The agent could not complete this request.",
    )


def _streaming_response(
    request: Request, run: PreparedAgentExecution
) -> StreamingResponse:
    """Run the synchronous graph in a bounded worker and stream safe events."""

    events: queue.Queue[AgentStreamEvent | None] = queue.Queue(maxsize=32)
    cancelled = threading.Event()

    def enqueue(event: AgentStreamEvent | None) -> bool:
        while not cancelled.is_set():
            try:
                events.put(event, timeout=0.25)
                return True
            except queue.Full:
                continue
        return False

    def produce() -> None:
        try:
            for event in stream_agent_events(run, cancelled):
                if not enqueue(event):
                    return
                if event.type in {
                    "run_completed",
                    "run_paused",
                    "error",
                }:
                    return
        finally:
            enqueue(None)

    async def event_stream():
        producer = threading.Thread(
            target=produce,
            name=f"custom-agent-stream-{run.run_id[:8]}",
            daemon=True,
        )
        producer.start()
        deadline = asyncio.get_running_loop().time() + run.timeout_seconds
        try:
            while True:
                if await request.is_disconnected():
                    cancelled.set()
                    return

                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    cancelled.set()
                    error = AgentExecutionErrorEvent(
                        run_id=run.run_id,
                        code="execution_timeout",
                        message="The agent execution timed out.",
                    )
                    yield f"event: error\ndata: {error.model_dump_json()}\n\n"
                    return

                try:
                    item = await asyncio.to_thread(
                        events.get,
                        True,
                        min(1.0, remaining),
                    )
                except queue.Empty:
                    yield ": ping\n\n"
                    continue

                if item is None:
                    return
                event_name = item.type
                payload = item.model_dump_json(exclude_none=True)
                yield f"event: {event_name}\ndata: {payload}\n\n"
                if event_name in {"run_completed", "run_paused", "error"}:
                    return
        finally:
            # Synchronous provider or tool calls may finish after disconnect;
            # graph workers check this flag between emitted events.
            cancelled.set()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/{agent_id}/invoke",
    response_model=AgentInvokeResponse | AgentInvokePendingResponse,
    response_model_exclude_none=True,
)
def invoke_custom_agent(
    data: AgentInvokeRequest,
    request: Request,
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentInvokeResponse:
    """Run one owner-scoped custom-agent turn."""

    checkpointer = getattr(request.app.state, "custom_agent_checkpointer", None)
    run = _prepare_or_raise(db, current_user, agent_id, data, checkpointer)
    try:
        return invoke_agent(run)
    except AgentRunError as error:
        raise _invoke_http_error(error) from None


@router.post("/{agent_id}/stream")
def stream_custom_agent(
    data: AgentInvokeRequest,
    request: Request,
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Stream safe custom-agent events without blocking the ASGI event loop."""

    checkpointer = getattr(request.app.state, "custom_agent_checkpointer", None)
    run = _prepare_or_raise(db, current_user, agent_id, data, checkpointer)
    return _streaming_response(request, run)


def _conversation_payload(conversation: Conversation) -> AgentConversationResponse:
    return AgentConversationResponse(
        id=conversation.id,
        agent_id=conversation.agent_id,
        title=conversation.title,
        document_ids=conversation_document_ids(conversation),
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


def _approval_payload(db: Session, approval) -> AgentApprovalSummary:
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


@router.get(
    "/{agent_id}/approvals",
    response_model=AgentApprovalListResponse,
)
def list_custom_agent_approvals(
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentApprovalListResponse:
    get_owned_agent(db, current_user, agent_id)
    approvals = list_pending_approvals(db, current_user, agent_id)
    return AgentApprovalListResponse(
        approvals=[_approval_payload(db, item) for item in approvals],
        total=len(approvals),
    )


@router.get(
    "/{agent_id}/approvals/{approval_id}",
    response_model=AgentApprovalSummary,
)
def get_custom_agent_approval(
    agent_id: int = Path(ge=1),
    approval_id: UUID = Path(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentApprovalSummary:
    get_owned_agent(db, current_user, agent_id)
    approval = get_owned_approval(db, current_user, agent_id, approval_id, lock=True)
    if approval.status == "pending" and as_utc(approval.expires_at) <= datetime.now(
        UTC
    ):
        expire_approval(db, approval)
        db.refresh(approval)
    return _approval_payload(db, approval)


def _decide_custom_agent_approval(
    db: Session,
    current_user: User,
    agent_id: int,
    approval_id: UUID,
    *,
    approve: bool,
) -> AgentApprovalDecisionResponse:
    get_owned_agent(db, current_user, agent_id)
    approval = get_owned_approval(db, current_user, agent_id, approval_id)
    with lock_conversations(db, [approval.conversation_id]):
        get_owned_agent_conversation(
            db,
            current_user,
            agent_id,
            approval.conversation_id,
        )
        updated = decide_approval(
            db,
            current_user,
            agent_id,
            approval_id,
            approve=approve,
        )
        return AgentApprovalDecisionResponse(approval=_approval_payload(db, updated))


@router.post(
    "/{agent_id}/approvals/{approval_id}/approve",
    response_model=AgentApprovalDecisionResponse,
)
def approve_custom_agent_action(
    agent_id: int = Path(ge=1),
    approval_id: UUID = Path(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentApprovalDecisionResponse:
    return _decide_custom_agent_approval(
        db,
        current_user,
        agent_id,
        approval_id,
        approve=True,
    )


@router.post(
    "/{agent_id}/approvals/{approval_id}/reject",
    response_model=AgentApprovalDecisionResponse,
)
def reject_custom_agent_action(
    agent_id: int = Path(ge=1),
    approval_id: UUID = Path(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentApprovalDecisionResponse:
    return _decide_custom_agent_approval(
        db,
        current_user,
        agent_id,
        approval_id,
        approve=False,
    )


@router.post("/{agent_id}/approvals/{approval_id}/resume")
def resume_custom_agent_approval(
    request: Request,
    agent_id: int = Path(ge=1),
    approval_id: UUID = Path(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    get_owned_agent(db, current_user, agent_id)
    approval = get_owned_approval(db, current_user, agent_id, approval_id)
    if approval.status not in {"approved", "rejected", "expired"}:
        raise HTTPException(status_code=409, detail="Approval is not ready to resume.")
    decision = "approve" if approval.status == "approved" else "reject"
    checkpointer = _required_checkpointer(request)
    try:
        run = prepare_agent_resume(
            db,
            current_user,
            agent_id,
            approval,
            decision=decision,
            checkpointer=checkpointer,
        )
    except AgentFactoryError as error:
        raise _factory_http_error(error) from None
    except AgentRunError as error:
        raise _invoke_http_error(error) from None
    return _streaming_response(request, run)


def _required_checkpointer(request: Request) -> BaseCheckpointSaver:
    checkpointer = getattr(request.app.state, "custom_agent_checkpointer", None)
    if checkpointer is None:
        raise HTTPException(
            status_code=503,
            detail="The application checkpointer is unavailable.",
        )
    return checkpointer


@router.post(
    "/{agent_id}/conversations",
    response_model=AgentConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_custom_agent_conversation(
    request: Request,
    data: AgentConversationCreate | None = None,
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentConversationResponse:
    agent = get_owned_agent(db, current_user, agent_id)
    _required_checkpointer(request)
    payload = data or AgentConversationCreate()
    conversation = create_agent_conversation(
        db,
        current_user,
        agent,
        title=payload.title,
        document_ids=payload.document_ids,
    )
    return _conversation_payload(conversation)


@router.get(
    "/{agent_id}/conversations",
    response_model=AgentConversationListResponse,
)
def list_custom_agent_conversations(
    agent_id: int = Path(ge=1),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentConversationListResponse:
    get_owned_agent(db, current_user, agent_id)
    conversations, total = list_agent_conversations(
        db,
        current_user,
        agent_id,
        offset=offset,
        limit=limit,
    )
    return AgentConversationListResponse(
        conversations=[_conversation_payload(item) for item in conversations],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/{agent_id}/conversations/{conversation_id}",
    response_model=AgentConversationResponse,
)
def get_custom_agent_conversation(
    agent_id: int = Path(ge=1),
    conversation_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentConversationResponse:
    get_owned_agent(db, current_user, agent_id)
    conversation = get_owned_agent_conversation(
        db,
        current_user,
        agent_id,
        conversation_id,
    )
    return _conversation_payload(conversation)


@router.get(
    "/{agent_id}/conversations/{conversation_id}/messages",
    response_model=AgentConversationMessagesResponse,
)
def custom_agent_conversation_messages(
    request: Request,
    agent_id: int = Path(ge=1),
    conversation_id: int = Path(ge=1),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentConversationMessagesResponse:
    get_owned_agent(db, current_user, agent_id)
    checkpointer = _required_checkpointer(request)
    try:
        with lock_conversations(db, [conversation_id]):
            conversation = get_owned_agent_conversation(
                db,
                current_user,
                agent_id,
                conversation_id,
            )
            messages = checkpoint_messages(checkpointer, conversation.thread_id)
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 - hide checkpointer/provider internals
        raise HTTPException(
            status_code=503,
            detail="Conversation history is temporarily unavailable.",
        ) from None
    page = messages[offset : offset + limit]
    return AgentConversationMessagesResponse(
        conversation_id=conversation.id,
        total=len(messages),
        offset=offset,
        limit=limit,
        messages=page,
    )


@router.patch(
    "/{agent_id}/conversations/{conversation_id}",
    response_model=AgentConversationResponse,
)
def rename_custom_agent_conversation(
    data: AgentConversationRename,
    agent_id: int = Path(ge=1),
    conversation_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentConversationResponse:
    get_owned_agent(db, current_user, agent_id)
    return _conversation_payload(
        rename_agent_conversation(
            db,
            current_user,
            agent_id,
            conversation_id,
            data.title,
        )
    )


@router.delete(
    "/{agent_id}/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_custom_agent_conversation(
    request: Request,
    agent_id: int = Path(ge=1),
    conversation_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    get_owned_agent(db, current_user, agent_id)
    checkpointer = _required_checkpointer(request)
    delete_agent_conversation(
        db,
        current_user,
        agent_id,
        conversation_id,
        checkpointer=checkpointer,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent_endpoint(
    data: AgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentResponse:
    return create_agent(db, current_user, data)


@router.get("", response_model=AgentListResponse)
def list_agents_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentListResponse:
    agents = list_agents(db, current_user)
    return AgentListResponse(agents=agents, total=len(agents))


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent_endpoint(
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentResponse:
    return get_owned_agent(db, current_user, agent_id)


@router.patch("/{agent_id}", response_model=AgentResponse)
def update_agent_endpoint(
    data: AgentUpdate,
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentResponse:
    return update_agent(db, current_user, agent_id, data)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent_endpoint(
    request: Request,
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    delete_agent(
        db,
        current_user,
        agent_id,
        checkpointer=getattr(
            request.app.state,
            "custom_agent_checkpointer",
            None,
        ),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)

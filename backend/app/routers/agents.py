"""Authenticated CRUD and execution endpoints for custom agent configurations."""

from __future__ import annotations

import asyncio
import queue
import threading

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response, status
from fastapi.responses import StreamingResponse
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
from app.models import User
from app.schemas import (
    AgentCreate,
    AgentExecutionErrorEvent,
    AgentInvokeRequest,
    AgentInvokeResponse,
    AgentListResponse,
    AgentResponse,
    AgentRunCompletedEvent,
    AgentStreamEvent,
    AgentUpdate,
)
from app.services.agent_execution import (
    AgentRunError,
    AgentRunRecursionError,
    AgentRunTimeoutError,
    PreparedAgentExecution,
    invoke_agent,
    prepare_agent_execution,
    stream_agent_events,
)
from app.services.agents import (
    create_agent,
    delete_agent,
    get_owned_agent,
    list_agents,
    update_agent,
)

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
) -> PreparedAgentExecution:
    try:
        return prepare_agent_execution(db, current_user, agent_id, data)
    except AgentFactoryError as error:
        raise _factory_http_error(error) from None


def _invoke_http_error(error: AgentRunError) -> HTTPException:
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


@router.post("/{agent_id}/invoke", response_model=AgentInvokeResponse)
def invoke_custom_agent(
    data: AgentInvokeRequest,
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentInvokeResponse:
    """Run one owner-scoped custom-agent request without persistent memory."""

    run = _prepare_or_raise(db, current_user, agent_id, data)
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

    run = _prepare_or_raise(db, current_user, agent_id, data)
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
                if isinstance(
                    event,
                    (AgentRunCompletedEvent, AgentExecutionErrorEvent),
                ):
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
                payload = item.model_dump_json()
                yield f"event: {event_name}\ndata: {payload}\n\n"
                if isinstance(item, (AgentRunCompletedEvent, AgentExecutionErrorEvent)):
                    return
        finally:
            # If the response closes early, the graph worker checks this flag
            # between yielded events. Synchronous SDK/tool calls may finish later.
            cancelled.set()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


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
    agent_id: int = Path(ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    delete_agent(db, current_user, agent_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

"""Agent chat, streaming and conversation history endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage
from langgraph.types import Command
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.context import (
    current_document_context,
    current_document_ids,
    current_user_id,
)
from app.core.dependencies import get_current_user
from app.database import SessionLocal, get_db
from app.models import Conversation, Document, User
from app.schemas import (
    ConversationCreate,
    ConversationRename,
    ConversationResponse,
)
from app.services.conversations import (
    conversation_document_ids,
    create_conversation,
    delete_conversation,
    get_owned_conversation,
    serialize_messages,
    touch_conversation,
    validate_document_ids,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["AI Agent"])


class ChatRequest(BaseModel):
    conversation_id: int
    message: str = Field(min_length=1, max_length=4000)
    document_ids: list[int] | None = Field(default=None, max_length=20)


class ApprovalRequest(BaseModel):
    conversation_id: int
    decision: Literal["approve", "reject"]


def get_graph(request: Request):
    graph = getattr(request.app.state, "agent", None)

    if graph is None:
        raise HTTPException(503, "Agent is not ready")

    return graph


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _document_context(db: Session, user_id: int, document_ids: list[int]) -> str:
    """Describe the documents selected for this conversation.

    Only files owned by the caller are described, so the model can never be
    nudged towards another user's document.
    """

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


def _set_context(user_id: int, document_ids: list[int], document_context: str = ""):
    return (
        current_user_id.set(user_id),
        current_document_ids.set(tuple(document_ids)),
        current_document_context.set(document_context),
    )


def _reset_context(tokens) -> None:
    current_user_id.reset(tokens[0])
    current_document_ids.reset(tokens[1])
    current_document_context.reset(tokens[2])


def _message_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return ""


def _pending_approvals(snapshot) -> list[dict]:
    approvals = []

    for item in snapshot.interrupts:
        value = item.value
        if isinstance(value, dict) and "document_id" in value:
            approvals.append(value)

    return approvals


def serialize_response(graph, thread_id: str, conversation_id: int) -> dict:
    snapshot = graph.get_state(_config(thread_id))

    approvals = _pending_approvals(snapshot)

    if approvals:
        return {
            "conversation_id": conversation_id,
            "thread_id": thread_id,
            "status": "approval_required",
            "answer": None,
            "pending_approvals": approvals,
        }

    messages = snapshot.values.get("messages", [])
    answer = ""

    for message in reversed(messages):
        if isinstance(message, AIMessage) and not message.tool_calls:
            answer = _message_text(message.content)
            break

    return {
        "conversation_id": conversation_id,
        "thread_id": thread_id,
        "status": "completed",
        "answer": answer,
        "pending_approvals": [],
    }


def _conversation_payload(conversation: Conversation) -> dict:
    return {
        "id": conversation.id,
        "thread_id": conversation.thread_id,
        "title": conversation.title,
        "document_ids": conversation_document_ids(conversation),
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "preview": None,
    }


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
def new_conversation(
    data: ConversationCreate | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = data or ConversationCreate()

    conversation = create_conversation(
        db,
        current_user,
        thread_id=str(uuid4()),
        document_ids=payload.document_ids,
        title=payload.title,
    )

    return _conversation_payload(conversation)


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversations = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(100)
    ).all()

    return [_conversation_payload(item) for item in conversations]


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = get_owned_conversation(db, current_user, conversation_id)
    return _conversation_payload(conversation)


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
def rename_conversation(
    conversation_id: int,
    data: ConversationRename,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = get_owned_conversation(db, current_user, conversation_id)

    conversation.title = data.title.strip()[:120]
    db.commit()
    db.refresh(conversation)

    return _conversation_payload(conversation)


@router.delete("/conversations/{conversation_id}")
def remove_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = get_owned_conversation(db, current_user, conversation_id)
    delete_conversation(db, conversation)

    return {"message": "Conversation deleted"}


@router.get("/conversations/{conversation_id}/messages")
def conversation_messages(
    conversation_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = get_owned_conversation(db, current_user, conversation_id)
    graph = get_graph(request)

    try:
        snapshot = graph.get_state(_config(conversation.thread_id))
        messages = snapshot.values.get("messages", [])
        approvals = _pending_approvals(snapshot)
    except Exception:
        logger.exception("Could not load conversation %s", conversation_id)
        messages = []
        approvals = []

    return {
        "conversation_id": conversation.id,
        "messages": serialize_messages(messages),
        "pending_approvals": approvals,
    }


def _prepare_chat(
    data: ChatRequest,
    db: Session,
    current_user: User,
    graph,
) -> tuple[Conversation, list[int], dict]:
    conversation = get_owned_conversation(db, current_user, data.conversation_id)

    if data.document_ids is not None:
        document_ids = validate_document_ids(db, current_user, data.document_ids)
        conversation.document_ids = json.dumps(document_ids)
        db.commit()
    else:
        document_ids = conversation_document_ids(conversation)

    config = _config(conversation.thread_id)
    snapshot = graph.get_state(config)

    if snapshot.interrupts:
        raise HTTPException(
            status_code=409,
            detail="Resolve the pending approval first.",
        )

    return conversation, document_ids, config


@router.post("/chat")
def chat(
    data: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    graph = get_graph(request)
    conversation, document_ids, config = _prepare_chat(data, db, current_user, graph)

    tokens = _set_context(
        current_user.id,
        document_ids,
        _document_context(db, current_user.id, document_ids),
    )

    try:
        graph.invoke(
            {"messages": [HumanMessage(content=data.message)]},
            config=config,
        )
    except Exception as exc:
        logger.exception("Agent chat failed")
        raise HTTPException(502, "The agent could not answer right now.") from exc
    finally:
        _reset_context(tokens)

    touch_conversation(db, conversation, first_message=data.message)

    return serialize_response(graph, conversation.thread_id, conversation.id)


@router.post("/approve")
def approve(
    data: ApprovalRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    graph = get_graph(request)
    conversation = get_owned_conversation(db, current_user, data.conversation_id)
    config = _config(conversation.thread_id)

    snapshot = graph.get_state(config)

    if not snapshot.interrupts:
        raise HTTPException(409, "No pending approval for this conversation.")

    document_ids = conversation_document_ids(conversation)

    tokens = _set_context(
        current_user.id,
        document_ids,
        _document_context(db, current_user.id, document_ids),
    )

    try:
        graph.invoke(Command(resume=data.decision), config=config)
    except Exception as exc:
        logger.exception("Approval resume failed")
        raise HTTPException(502, "The agent could not resume.") from exc
    finally:
        _reset_context(tokens)

    touch_conversation(db, conversation)

    return serialize_response(graph, conversation.thread_id, conversation.id)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, default=str)}\n\n"


@router.post("/chat/stream")
async def chat_stream(
    data: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    graph = get_graph(request)
    conversation, document_ids, config = _prepare_chat(data, db, current_user, graph)

    conversation_id = conversation.id
    thread_id = conversation.thread_id
    user_id = current_user.id
    user_message = data.message
    document_context = _document_context(db, current_user.id, document_ids)

    queue: asyncio.Queue = asyncio.Queue()
    cancel = threading.Event()
    loop = asyncio.get_running_loop()

    def put(item) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, item)

    def producer() -> None:
        tokens = _set_context(user_id, document_ids, document_context)

        try:
            for mode, payload in graph.stream(
                {"messages": [HumanMessage(content=user_message)]},
                config=config,
                stream_mode=["messages", "updates"],
            ):
                if cancel.is_set():
                    break
                put((mode, payload))

            if not cancel.is_set():
                put(("final", serialize_response(graph, thread_id, conversation_id)))
        except Exception:
            logger.exception("Streaming agent run failed")
            put(("error", "The agent could not answer right now."))
        finally:
            _reset_context(tokens)
            put(("end", None))

    async def event_stream():
        thread = threading.Thread(target=producer, daemon=True)
        thread.start()

        final_payload: dict | None = None
        started = False

        try:
            while True:
                if await request.is_disconnected():
                    cancel.set()
                    break

                try:
                    mode, payload = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield ": ping\n\n"
                    continue

                if mode == "end":
                    break

                if mode == "error":
                    yield _sse({"type": "error", "message": payload})
                    continue

                if mode == "final":
                    final_payload = payload
                    continue

                if mode == "messages":
                    chunk, metadata = payload

                    if not isinstance(chunk, AIMessageChunk):
                        continue

                    if metadata.get("langgraph_node") != "chatbot":
                        continue

                    if getattr(chunk, "tool_call_chunks", None):
                        continue

                    text = _message_text(chunk.content)

                    if text:
                        if not started:
                            started = True
                        yield _sse({"type": "token", "text": text})
                    continue

                if mode == "updates" and isinstance(payload, dict):
                    for node, update in payload.items():
                        messages = (
                            update.get("messages", [])
                            if isinstance(update, dict)
                            else []
                        )

                        if node == "chatbot":
                            for message in messages:
                                for call in getattr(message, "tool_calls", None) or []:
                                    yield _sse(
                                        {
                                            "type": "tool",
                                            "status": "started",
                                            "name": call.get("name", "tool"),
                                        }
                                    )
                        elif node == "tools":
                            for message in messages:
                                if isinstance(message, ToolMessage):
                                    yield _sse(
                                        {
                                            "type": "tool",
                                            "status": "completed",
                                            "name": message.name or "tool",
                                        }
                                    )

            if final_payload is not None:
                with SessionLocal() as session:
                    conversation_row = session.get(Conversation, conversation_id)
                    if conversation_row is not None:
                        touch_conversation(
                            session,
                            conversation_row,
                            first_message=user_message,
                        )

                approvals = final_payload.get("pending_approvals") or []

                if approvals:
                    yield _sse({"type": "approval", "approvals": approvals})

                yield _sse(
                    {
                        "type": "done",
                        "status": final_payload.get("status"),
                        "answer": final_payload.get("answer"),
                    }
                )
            elif not cancel.is_set():
                yield _sse(
                    {
                        "type": "error",
                        "message": "Streaming ended unexpectedly.",
                    }
                )
        finally:
            cancel.set()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

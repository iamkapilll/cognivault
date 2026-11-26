"""Conversation metadata and LangGraph thread lifecycle helpers."""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from fastapi import HTTPException
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.models import Conversation, Document, User

CHECKPOINT_TABLES = (
    "checkpoint_writes",
    "checkpoint_blobs",
    "checkpoints",
)
_CONVERSATION_LOCK_NAMESPACE = 1_734_842_109
_LOCAL_CONVERSATION_LOCK = threading.RLock()


@contextmanager
def lock_conversations(db: Session, conversation_ids: list[int]) -> Iterator[None]:
    """Serialize checkpoint mutations across PostgreSQL workers.

    Production uses transaction-scoped advisory locks keyed by conversation ID.
    SQLite tests use one process-local lock because SQLite has no advisory locks.
    The caller must commit successful metadata updates before leaving the block;
    any open transaction is rolled back on exit to release a failed run's lock.
    """

    database_bind = db.get_bind()
    is_postgres = database_bind.dialect.name == "postgresql"
    local_lock_acquired = False
    if is_postgres:
        for conversation_id in sorted(set(conversation_ids)):
            db.execute(
                text("SELECT pg_advisory_xact_lock(:namespace, :conversation_id)"),
                {
                    "namespace": _CONVERSATION_LOCK_NAMESPACE,
                    "conversation_id": conversation_id,
                },
            )
    else:
        _LOCAL_CONVERSATION_LOCK.acquire()
        local_lock_acquired = True

    try:
        yield
    except Exception:
        db.rollback()
        raise
    finally:
        if db.in_transaction():
            db.rollback()
        if local_lock_acquired:
            _LOCAL_CONVERSATION_LOCK.release()


def validate_document_ids(
    db: Session,
    user: User,
    document_ids: list[int],
) -> list[int]:
    if not document_ids:
        return []

    unique_ids = list(dict.fromkeys(document_ids))

    owned = set(
        db.scalars(
            select(Document.id).where(
                Document.id.in_(unique_ids),
                Document.user_id == user.id,
            )
        ).all()
    )

    missing = [item for item in unique_ids if item not in owned]

    if missing:
        raise HTTPException(404, "Document not found")

    return unique_ids


def create_conversation(
    db: Session,
    user: User,
    *,
    thread_id: str,
    document_ids: list[int] | None = None,
    title: str | None = None,
) -> Conversation:
    validated = validate_document_ids(db, user, document_ids or [])

    conversation = Conversation(
        user_id=user.id,
        thread_id=thread_id,
        title=(title or "New chat")[:120],
        document_ids=json.dumps(validated),
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return conversation


def get_owned_conversation(
    db: Session,
    user: User,
    conversation_id: int,
) -> Conversation:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
            Conversation.agent_id.is_(None),
        )
    )

    if conversation is None:
        raise HTTPException(404, "Conversation not found")

    return conversation


def conversation_document_ids(conversation: Conversation) -> list[int]:
    try:
        value = json.loads(conversation.document_ids or "[]")
    except (TypeError, ValueError):
        return []

    if not isinstance(value, list):
        return []

    return [int(item) for item in value if isinstance(item, int)]


def touch_conversation(
    db: Session,
    conversation: Conversation,
    *,
    first_message: str | None = None,
) -> None:
    conversation.updated_at = datetime.now(UTC)

    if first_message and conversation.title == "New chat" and first_message.strip():
        title = " ".join(first_message.split())
        conversation.title = title[:60]

    db.commit()


def delete_conversation_thread(
    db: Session,
    thread_id: str,
    *,
    checkpointer: BaseCheckpointSaver | None = None,
) -> None:
    # PostgreSQL checkpoint deletion participates in the surrounding SQL
    # transaction. Test savers have no checkpoint tables, so use their public
    # delete method instead.
    dialect_name = db.get_bind().dialect.name
    if dialect_name != "postgresql":
        if checkpointer is not None:
            checkpointer.delete_thread(thread_id)
        return
    for table in CHECKPOINT_TABLES:
        db.execute(
            text(f"DELETE FROM {table} WHERE thread_id = :thread_id"),
            {"thread_id": thread_id},
        )


def delete_conversation(
    db: Session,
    conversation: Conversation,
) -> None:
    delete_conversation_thread(db, conversation.thread_id)
    db.execute(delete(Conversation).where(Conversation.id == conversation.id))
    db.commit()


def serialize_messages(messages: list[BaseMessage]) -> list[dict[str, str]]:
    """Reduce LangGraph state messages to user/assistant chat turns."""

    def visible_text(content) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            )
        return ""

    serialized: list[dict] = []

    for message in messages:
        if isinstance(message, HumanMessage):
            content = visible_text(message.content)
            if content.strip():
                serialized.append({"role": "user", "content": content})
        elif isinstance(message, AIMessage):
            if message.tool_calls:
                continue
            content = visible_text(message.content)
            if content.strip():
                serialized.append({"role": "assistant", "content": content})

    return serialized

"""Conversation metadata and LangGraph thread lifecycle helpers."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.models import Conversation, Document, User

CHECKPOINT_TABLES = (
    "checkpoint_writes",
    "checkpoint_blobs",
    "checkpoints",
)


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


def delete_conversation_thread(db: Session, thread_id: str) -> None:
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


def serialize_messages(messages: list) -> list[dict]:
    """Reduce LangGraph state messages to user/assistant chat turns."""
    from langchain_core.messages import AIMessage, HumanMessage

    serialized: list[dict] = []

    for message in messages:
        if isinstance(message, HumanMessage):
            content = message.content
            if isinstance(content, str) and content.strip():
                serialized.append({"role": "user", "content": content})
        elif isinstance(message, AIMessage):
            if message.tool_calls:
                continue
            content = message.content
            if isinstance(content, str) and content.strip():
                serialized.append({"role": "assistant", "content": content})

    return serialized

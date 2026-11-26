"""Owner- and agent-scoped conversation metadata and checkpoint access."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from langgraph.checkpoint.base import BaseCheckpointSaver
from sqlalchemy import delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Agent, AgentApproval, Conversation, User
from app.services.conversations import (
    delete_conversation_thread,
    lock_conversations,
    serialize_messages,
    validate_document_ids,
)


def _ensure_memory_enabled(agent: Agent) -> None:
    if agent.memory_enabled is not True:
        raise HTTPException(
            status_code=409,
            detail="Persistent conversations require an agent with memory enabled.",
        )


def create_agent_conversation(
    db: Session,
    user: User,
    agent: Agent,
    *,
    title: str | None,
    document_ids: list[int],
) -> Conversation:
    """Create a server-threaded conversation for a saved memory agent."""

    _ensure_memory_enabled(agent)
    # Serialize creation with memory disabling and agent deletion. PostgreSQL
    # waits on this row lock; SQLite simply executes the same ownership query.
    locked_agent = db.scalar(
        select(Agent)
        .where(Agent.id == agent.id, Agent.user_id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked_agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    _ensure_memory_enabled(locked_agent)
    owned_document_ids = validate_document_ids(db, user, document_ids)
    conversation = Conversation(
        user_id=user.id,
        agent_id=locked_agent.id,
        thread_id=str(uuid4()),
        title=(title or "New conversation")[:120],
        document_ids=json.dumps(owned_document_ids),
    )
    db.add(conversation)
    try:
        db.commit()
        db.refresh(conversation)
    except SQLAlchemyError:
        db.rollback()
        raise
    return conversation


def list_agent_conversations(
    db: Session,
    user: User,
    agent_id: int,
    *,
    offset: int,
    limit: int,
) -> tuple[list[Conversation], int]:
    filters = (
        Conversation.user_id == user.id,
        Conversation.agent_id == agent_id,
    )
    total = (
        db.scalar(select(func.count()).select_from(Conversation).where(*filters)) or 0
    )
    conversations = list(
        db.scalars(
            select(Conversation)
            .where(*filters)
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
    return conversations, total


def get_owned_agent_conversation(
    db: Session,
    user: User,
    agent_id: int,
    conversation_id: int,
) -> Conversation:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
            Conversation.agent_id == agent_id,
        )
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


def rename_agent_conversation(
    db: Session,
    user: User,
    agent_id: int,
    conversation_id: int,
    title: str,
) -> Conversation:
    with lock_conversations(db, [conversation_id]):
        conversation = get_owned_agent_conversation(
            db,
            user,
            agent_id,
            conversation_id,
        )
        conversation.title = title.strip()[:120]
        conversation.updated_at = datetime.now(UTC)
        try:
            db.commit()
            db.refresh(conversation)
        except SQLAlchemyError:
            db.rollback()
            raise
        return conversation


def checkpoint_messages(
    checkpointer: BaseCheckpointSaver,
    thread_id: str,
) -> list[dict[str, str]]:
    """Return only the public user/assistant view of an internal checkpoint."""

    checkpoint_tuple = checkpointer.get_tuple(
        {"configurable": {"thread_id": thread_id}}
    )
    if checkpoint_tuple is None:
        return []

    checkpoint = checkpoint_tuple.checkpoint
    channel_values = checkpoint.get("channel_values", {})
    messages = channel_values.get("messages", [])
    if not isinstance(messages, list):
        return []
    return serialize_messages(messages)


def delete_agent_conversation(
    db: Session,
    user: User,
    agent_id: int,
    conversation_id: int,
    *,
    checkpointer: BaseCheckpointSaver,
) -> None:
    """Delete one owned thread and its checkpoints under the conversation lock."""

    with lock_conversations(db, [conversation_id]):
        conversation = get_owned_agent_conversation(
            db,
            user,
            agent_id,
            conversation_id,
        )
        delete_conversation_thread(
            db,
            conversation.thread_id,
            checkpointer=checkpointer,
        )
        db.execute(
            delete(AgentApproval).where(
                AgentApproval.user_id == user.id,
                AgentApproval.agent_id == agent_id,
                AgentApproval.conversation_id == conversation_id,
            )
        )
        db.delete(conversation)
        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            raise

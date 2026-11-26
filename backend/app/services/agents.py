"""CRUD operations for user-owned custom agent configurations."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException
from langgraph.checkpoint.base import BaseCheckpointSaver
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.agent_config import validate_model_configuration
from app.core.model_registry import ModelRegistryError
from app.models import Agent, AgentApproval, Conversation, User
from app.schemas import AgentCreate, AgentUpdate
from app.services.agent_guardrails import approval_required
from app.services.conversations import delete_conversation_thread, lock_conversations
from app.services.tool_registry import TOOL_REGISTRY


def _validate_model_configuration(
    provider: str,
    model_name: str,
    *,
    temperature: float,
    require_tool_calling: bool,
) -> None:
    """Translate sanitized registry failures into a client configuration error."""

    try:
        validate_model_configuration(
            provider,
            model_name,
            temperature=temperature,
            require_tool_calling=require_tool_calling,
        )
    except ModelRegistryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


def _validate_approval_configuration(
    *,
    memory_enabled: bool,
    human_approval_required: bool,
    enabled_tools: list[str],
) -> None:
    """Approval pauses need a durable thread, including server-mandated ones."""

    needs_approval = human_approval_required or any(
        approval_required(TOOL_REGISTRY.get_metadata(name), False)
        for name in enabled_tools
    )
    if needs_approval and not memory_enabled:
        raise HTTPException(
            status_code=422,
            detail="Approval-enabled agents require persistent memory.",
        )


def list_agents(db: Session, user: User) -> list[Agent]:
    """Return only the caller's agents, newest first."""

    return list(
        db.scalars(
            select(Agent)
            .where(Agent.user_id == user.id)
            .order_by(Agent.updated_at.desc(), Agent.id.desc())
        ).all()
    )


def get_owned_agent(db: Session, user: User, agent_id: int) -> Agent:
    """Fetch an owned agent or return 404 for both missing and foreign IDs."""

    agent = db.scalar(
        select(Agent).where(
            Agent.id == agent_id,
            Agent.user_id == user.id,
        )
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


def create_agent(db: Session, user: User, data: AgentCreate) -> Agent:
    """Create an agent under the authenticated user's identity."""

    _validate_model_configuration(
        data.model_provider,
        data.model_name,
        temperature=data.temperature,
        require_tool_calling=bool(data.enabled_tools),
    )
    _validate_approval_configuration(
        memory_enabled=data.memory_enabled,
        human_approval_required=data.human_approval_required,
        enabled_tools=data.enabled_tools,
    )
    agent = Agent(user_id=user.id, **data.model_dump())
    db.add(agent)

    try:
        db.commit()
        db.refresh(agent)
    except SQLAlchemyError:
        db.rollback()
        raise

    return agent


def update_agent(
    db: Session,
    user: User,
    agent_id: int,
    data: AgentUpdate,
) -> Agent:
    """Update an owned agent after validating the merged model settings."""

    agent = db.scalar(
        select(Agent)
        .where(Agent.id == agent_id, Agent.user_id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    changes = data.model_dump(exclude_unset=True)
    provider = changes.get("model_provider", agent.model_provider)
    model_name = changes.get("model_name", agent.model_name)
    temperature = changes.get("temperature", agent.temperature)
    enabled_tools = changes.get("enabled_tools", agent.enabled_tools)
    memory_enabled = changes.get("memory_enabled", agent.memory_enabled)
    human_approval_required = changes.get(
        "human_approval_required", agent.human_approval_required
    )
    if agent.memory_enabled is True and changes.get("memory_enabled") is False:
        # Conversation creation takes the same agent row lock, so this check
        # cannot race with a new persistent conversation being inserted.
        has_conversations = db.scalar(
            select(Conversation.id).where(Conversation.agent_id == agent.id).limit(1)
        )
        if has_conversations is not None:
            raise HTTPException(
                status_code=409,
                detail="Delete its conversations before disabling memory.",
            )
    _validate_model_configuration(
        provider,
        model_name,
        temperature=temperature,
        require_tool_calling=bool(enabled_tools),
    )
    _validate_approval_configuration(
        memory_enabled=memory_enabled,
        human_approval_required=human_approval_required,
        enabled_tools=enabled_tools,
    )

    for field_name, value in changes.items():
        setattr(agent, field_name, value)
    agent.updated_at = datetime.now(UTC)

    try:
        db.commit()
        db.refresh(agent)
    except SQLAlchemyError:
        db.rollback()
        raise

    return agent


def delete_agent(
    db: Session,
    user: User,
    agent_id: int,
    *,
    checkpointer: BaseCheckpointSaver | None = None,
) -> None:
    """Delete the owned agent, conversations, and their exact checkpoint threads."""

    agent = db.scalar(
        select(Agent)
        .where(Agent.id == agent_id, Agent.user_id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    conversations = list(
        db.scalars(
            select(Conversation)
            .where(Conversation.agent_id == agent.id)
            .order_by(Conversation.id)
        ).all()
    )

    with lock_conversations(db, [conversation.id for conversation in conversations]):
        try:
            for conversation in conversations:
                delete_conversation_thread(
                    db,
                    conversation.thread_id,
                    checkpointer=checkpointer,
                )
                db.delete(conversation)
            db.execute(
                delete(AgentApproval).where(
                    AgentApproval.user_id == user.id,
                    AgentApproval.agent_id == agent.id,
                )
            )
            db.delete(agent)
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            raise

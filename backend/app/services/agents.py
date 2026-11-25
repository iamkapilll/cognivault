"""CRUD operations for user-owned custom agent configurations."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.agent_config import validate_model_configuration
from app.models import Agent, User
from app.schemas import AgentCreate, AgentUpdate


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

    validate_model_configuration(data.model_provider, data.model_name)
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

    agent = get_owned_agent(db, user, agent_id)
    changes = data.model_dump(exclude_unset=True)
    provider = changes.get("model_provider", agent.model_provider)
    model_name = changes.get("model_name", agent.model_name)
    validate_model_configuration(provider, model_name)

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


def delete_agent(db: Session, user: User, agent_id: int) -> None:
    """Delete an owned agent without exposing foreign agent identifiers."""

    agent = get_owned_agent(db, user, agent_id)
    db.delete(agent)

    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

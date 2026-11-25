"""Authenticated CRUD endpoints for custom agent configurations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import AgentCreate, AgentListResponse, AgentResponse, AgentUpdate
from app.services.agents import (
    create_agent,
    delete_agent,
    get_owned_agent,
    list_agents,
    update_agent,
)

router = APIRouter(prefix="/agents", tags=["Agents"])


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

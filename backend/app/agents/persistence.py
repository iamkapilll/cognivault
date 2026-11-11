"""Application lifespan: validate configuration and build the agent graph."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from langgraph.checkpoint.postgres import PostgresSaver

from app.agents.graph import build_agent
from app.core.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def agent_lifespan(app: FastAPI):
    settings.validate()

    # SQLAlchemy's postgresql+psycopg:// URL is not accepted as a psycopg
    # connection string, which is what the LangGraph saver expects.
    connection_string = settings.database_url.replace(
        "postgresql+psycopg://",
        "postgresql://",
        1,
    )

    with PostgresSaver.from_conn_string(connection_string) as checkpointer:
        checkpointer.setup()

        app.state.agent = build_agent(checkpointer)

        logger.info("Agent graph ready")

        yield

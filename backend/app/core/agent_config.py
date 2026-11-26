"""Server-owned configuration allowlists for custom agent records."""

from __future__ import annotations

from app.core.model_registry import (
    DEFAULT_AGENT_MODEL,
    DEFAULT_AGENT_PROVIDER,
    SUPPORTED_AGENT_MODELS,
    validate_model_configuration,
)
from app.services.tool_registry import ALLOWED_AGENT_TOOLS

# Re-export model defaults and validation alongside the agent tool allowlist so
# existing schemas and services keep one stable configuration import path.
__all__ = [
    "ALLOWED_AGENT_TOOLS",
    "DEFAULT_AGENT_MODEL",
    "DEFAULT_AGENT_PROVIDER",
    "SUPPORTED_AGENT_MODELS",
    "validate_model_configuration",
]

"""Server-owned configuration allowlists for custom agent records."""

from __future__ import annotations

from app.core.model_registry import (
    DEFAULT_AGENT_MODEL,
    DEFAULT_AGENT_PROVIDER,
    SUPPORTED_AGENT_MODELS,
    validate_model_configuration,
)

# These names correspond to tools registered by app.services.agent_tools.TOOLS.
# Clients can select from this fixed set but cannot submit executable code.
ALLOWED_AGENT_TOOLS = frozenset(
    {
        "search_documents",
        "get_document_details",
        "summarize_document",
        "compare_documents",
        "extract_document_fields",
        "search_web",
        "generate_research_report",
        "delete_document",
    }
)

# Re-export model defaults and validation alongside the agent tool allowlist so
# existing schemas and services keep one stable configuration import path.
__all__ = [
    "ALLOWED_AGENT_TOOLS",
    "DEFAULT_AGENT_MODEL",
    "DEFAULT_AGENT_PROVIDER",
    "SUPPORTED_AGENT_MODELS",
    "validate_model_configuration",
]

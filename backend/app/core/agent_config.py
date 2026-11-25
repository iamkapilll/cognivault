"""Server-owned configuration allowlists for custom agent records."""

from __future__ import annotations

from app.core.config import settings

DEFAULT_AGENT_PROVIDER = "groq"
DEFAULT_AGENT_MODEL = settings.groq_model

# Agent records cannot introduce providers or models that this deployment has
# not configured. Execution remains separate from this persistence layer.
SUPPORTED_AGENT_MODELS = {
    DEFAULT_AGENT_PROVIDER: frozenset({DEFAULT_AGENT_MODEL}),
}

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


def validate_model_configuration(provider: str, model_name: str) -> None:
    """Reject model pairs that are not explicitly enabled by the server."""

    allowed_models = SUPPORTED_AGENT_MODELS.get(provider)
    if allowed_models is None or model_name not in allowed_models:
        raise ValueError("Unsupported model configuration")

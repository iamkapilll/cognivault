"""Deterministic guardrails for custom-agent inputs and registered tools.

These checks reduce prompt-injection and unsafe-tool risk; they do not make
prompt injection impossible. Authorization always comes from server-side user
context and database ownership queries, never model instructions.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

from langchain_core.tools import BaseTool
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Document
from app.services.tool_registry import ToolEffect, ToolMetadata, ToolRiskLevel

MAX_TOOL_ARGUMENTS_BYTES = 16_000
MAX_TOOL_OUTPUT_CHARS = 12_000
_SECRET_PATTERNS = (
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}"),
    re.compile(r"\bgsk_[A-Za-z0-9_-]{20,}"),
    re.compile(r"\bsk-ant-[A-Za-z0-9_-]{16,}"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}"),
)


class GuardrailViolation(ValueError):
    """A deterministic input, tool, or ownership policy rejected a run."""


def validate_user_input(message: str) -> str:
    """Recheck untrusted request text at the execution boundary."""

    if not isinstance(message, str):
        raise GuardrailViolation("Invalid agent input.")
    normalized = message.strip()
    if not normalized or len(normalized) > settings.custom_agent_max_message_length:
        raise GuardrailViolation("Agent input is empty or exceeds the allowed limit.")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in normalized):
        raise GuardrailViolation("Agent input contains unsupported control characters.")
    return normalized


def validate_tool_arguments(tool: BaseTool, arguments: object) -> dict[str, object]:
    """Parse model arguments using the registered tool's Pydantic input schema."""

    if not isinstance(arguments, Mapping):
        raise GuardrailViolation("Tool arguments must be an object.")
    schema = tool.get_input_schema()
    try:
        if not issubclass(schema, BaseModel):
            raise GuardrailViolation("Tool input schema is unavailable.")
        values = dict(arguments)
        if set(values) - set(schema.model_fields):
            raise GuardrailViolation("Tool arguments contain unsupported fields.")
        parsed = schema.model_validate(values)
    except ValidationError:
        raise GuardrailViolation("Tool arguments failed validation.") from None
    normalized = parsed.model_dump(mode="json", exclude_none=True)
    if len(str(normalized).encode("utf-8")) > MAX_TOOL_ARGUMENTS_BYTES:
        raise GuardrailViolation("Tool arguments exceed the allowed limit.")
    return normalized


def validate_document_ownership(
    db: Session,
    user_id: int,
    arguments: Mapping[str, object],
) -> tuple[int, ...]:
    """Independently verify every document identifier named by a tool."""

    identifiers: list[int] = []
    for name, value in arguments.items():
        if name == "document_ids" and isinstance(value, list):
            candidates = value
        elif name.endswith("document_id"):
            candidates = [value]
        else:
            continue
        for candidate in candidates:
            if type(candidate) is not int or candidate < 1:
                raise GuardrailViolation("Tool document identifiers are invalid.")
            identifiers.append(candidate)

    unique_ids = tuple(dict.fromkeys(identifiers))
    if not unique_ids:
        return ()

    owned = set(
        db.scalars(
            select(Document.id).where(
                Document.id.in_(unique_ids),
                Document.user_id == user_id,
            )
        ).all()
    )
    if owned != set(unique_ids):
        raise GuardrailViolation("A requested document is not available to this user.")
    return unique_ids


def approval_required(metadata: ToolMetadata, agent_requires_approval: bool) -> bool:
    """Apply owner policy plus the server's non-overridable tool risk floor."""

    return (
        agent_requires_approval is True
        or metadata.requires_human_approval
        or metadata.effect is ToolEffect.SIDE_EFFECTING
        or metadata.risk_level in {ToolRiskLevel.HIGH, ToolRiskLevel.DESTRUCTIVE}
    )


def action_summary(tool_name: str, arguments: Mapping[str, object]) -> str:
    """Create a short, non-content-bearing approval description."""

    if tool_name == "delete_document":
        document_id = arguments.get("document_id")
        return f"Permanently delete document {document_id}."
    return f"Allow the agent to run the {tool_name} tool once."


def filter_sensitive_output(value: object) -> str:
    """Bound tool/model output and redact common credential-shaped strings."""

    text = value if isinstance(value, str) else str(value)
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    if len(text) > MAX_TOOL_OUTPUT_CHARS:
        text = text[:MAX_TOOL_OUTPUT_CHARS] + "\n[output truncated]"
    return text

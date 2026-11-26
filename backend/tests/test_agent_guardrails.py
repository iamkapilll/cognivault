"""Deterministic custom-agent guardrail tests without external services."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.database import Base
from app.models import Document, User
from app.services.agent_approvals import canonical_arguments
from app.services.agent_guardrails import (
    GuardrailViolation,
    approval_required,
    filter_sensitive_output,
    validate_document_ownership,
    validate_tool_arguments,
    validate_user_input,
)
from app.services.agent_tools import get_document_details
from app.services.tool_registry import TOOL_REGISTRY


@pytest.fixture
def ownership_db() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=[User.__table__, Document.__table__])
    with Session(engine, expire_on_commit=False) as db:
        owner = User(email="guardrail-owner@example.com", password_hash="test")
        other = User(email="guardrail-other@example.com", password_hash="test")
        db.add_all([owner, other])
        db.flush()
        document = Document(
            user_id=owner.id,
            filename="owner-only.pdf",
            status="completed",
        )
        db.add(document)
        db.commit()
        db.info["owner_id"] = owner.id
        db.info["other_id"] = other.id
        db.info["document_id"] = document.id
        yield db
    engine.dispose()


def test_input_limit_and_control_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "custom_agent_max_message_length", 12)
    assert validate_user_input("  explain this  ") == "explain this"
    with pytest.raises(GuardrailViolation):
        validate_user_input("x" * 13)
    with pytest.raises(GuardrailViolation):
        validate_user_input("safe\x00text")


def test_tool_arguments_are_parsed_by_the_registered_pydantic_schema() -> None:
    assert validate_tool_arguments(
        get_document_details,
        {"document_id": 23},
    ) == {"document_id": 23}
    with pytest.raises(GuardrailViolation):
        validate_tool_arguments(get_document_details, {"document_id": "not-an-id"})
    with pytest.raises(GuardrailViolation):
        validate_tool_arguments(get_document_details, [23])


def test_document_ownership_is_checked_independently_of_model_instructions(
    ownership_db: Session,
) -> None:
    owner_id = ownership_db.info["owner_id"]
    other_id = ownership_db.info["other_id"]
    document_id = ownership_db.info["document_id"]

    assert validate_document_ownership(
        ownership_db,
        owner_id,
        {"document_id": document_id},
    ) == (document_id,)
    with pytest.raises(GuardrailViolation):
        validate_document_ownership(
            ownership_db,
            other_id,
            {"document_id": document_id},
        )


def test_server_risk_policy_cannot_be_disabled_by_agent_configuration() -> None:
    deletion = TOOL_REGISTRY.get_metadata("delete_document")
    assert approval_required(deletion, False) is True
    assert approval_required(deletion, True) is True
    assert approval_required(TOOL_REGISTRY.get_metadata("search_documents"), True)


def test_sensitive_output_filter_redacts_keys_and_bounds_size() -> None:
    value = filter_sensitive_output("token gsk_" + "a" * 28)
    assert value == "token [REDACTED]"
    assert "secret" not in filter_sensitive_output("sk-" + "x" * 32)
    assert filter_sensitive_output("x" * 12_100).endswith("[output truncated]")


def test_approval_argument_hash_is_stable_and_detects_changes() -> None:
    first, first_hash = canonical_arguments({"document_id": 1, "flag": True})
    second, second_hash = canonical_arguments({"flag": True, "document_id": 1})
    changed, changed_hash = canonical_arguments({"document_id": 2, "flag": True})

    assert first == second
    assert first_hash == second_hash
    assert changed["document_id"] == 2
    assert changed_hash != first_hash

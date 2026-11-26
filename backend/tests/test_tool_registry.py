"""Metadata, availability and authorization tests for the server tool registry."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.tool_registry import (
    ALLOWED_AGENT_TOOLS,
    TOOL_REGISTRY,
    AuthenticationRequirement,
    AvailabilityPolicy,
    DuplicateToolNameError,
    InvalidToolConfigurationError,
    ServerConfiguration,
    ToolApprovalUnavailableError,
    ToolAuthenticationRequiredError,
    ToolAvailabilityStatus,
    ToolCategory,
    ToolConfigurationUnavailableError,
    ToolDisabledError,
    ToolEffect,
    ToolRegistry,
    ToolRiskLevel,
    UnknownToolError,
)


def test_registry_lists_unique_metadata_for_every_existing_tool() -> None:
    metadata = TOOL_REGISTRY.list_tools()
    names = [item.name for item in metadata]

    assert set(names) == ALLOWED_AGENT_TOOLS
    assert len(names) == len(set(names))
    assert all(item.display_name and item.description for item in metadata)


def test_duplicate_tool_names_are_rejected_at_registry_construction() -> None:
    registration = TOOL_REGISTRY.get_registration("search_documents")

    with pytest.raises(DuplicateToolNameError):
        ToolRegistry([registration, registration])


def test_metadata_categorizes_risk_effect_authentication_and_configuration() -> None:
    search = TOOL_REGISTRY.get_metadata("search_documents")
    summarize = TOOL_REGISTRY.get_metadata("summarize_document")
    web_search = TOOL_REGISTRY.get_metadata("search_web")
    report = TOOL_REGISTRY.get_metadata("generate_research_report")
    deletion = TOOL_REGISTRY.get_metadata("delete_document")

    assert search.category is ToolCategory.KNOWLEDGE_RETRIEVAL
    assert search.risk_level is ToolRiskLevel.LOW
    assert search.effect is ToolEffect.READ_ONLY
    assert search.authentication is AuthenticationRequirement.AUTHENTICATED_USER
    assert summarize.required_server_configuration == (
        ServerConfiguration.GROQ_API_KEY,
    )
    assert summarize.availability is AvailabilityPolicy.SERVER_CONFIGURATION
    assert web_search.required_server_configuration == (
        ServerConfiguration.TAVILY_API_KEY,
    )
    assert report.required_server_configuration == (
        ServerConfiguration.GROQ_API_KEY,
        ServerConfiguration.TAVILY_API_KEY,
    )
    assert deletion.category is ToolCategory.DOCUMENT_MANAGEMENT
    assert deletion.risk_level is ToolRiskLevel.DESTRUCTIVE
    assert deletion.effect is ToolEffect.SIDE_EFFECTING
    assert deletion.requires_human_approval is True
    assert deletion.enabled_for_custom_agents is False


def test_tool_availability_tracks_required_server_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "tavily_api_key", "")

    assert (
        TOOL_REGISTRY.get_availability("search_web")
        is ToolAvailabilityStatus.MISSING_CONFIGURATION
    )
    assert not TOOL_REGISTRY.is_available("search_web")

    monkeypatch.setattr(settings, "tavily_api_key", "test-only-tavily-key")
    assert (
        TOOL_REGISTRY.get_availability("search_web") is ToolAvailabilityStatus.AVAILABLE
    )
    assert TOOL_REGISTRY.is_available("search_web")


@pytest.mark.parametrize(
    ("tool_name", "missing_configuration"),
    [
        ("summarize_document", "groq_api_key"),
        ("compare_documents", "groq_api_key"),
        ("search_web", "tavily_api_key"),
        ("generate_research_report", "groq_api_key"),
        ("generate_research_report", "tavily_api_key"),
    ],
)
def test_each_external_tool_fails_closed_when_configuration_is_missing(
    monkeypatch: pytest.MonkeyPatch,
    tool_name: str,
    missing_configuration: str,
) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "tavily_api_key", "")
    if missing_configuration == "groq_api_key":
        monkeypatch.setattr(settings, "tavily_api_key", "local-test-key")
    else:
        monkeypatch.setattr(settings, "groq_api_key", "local-test-key")

    with pytest.raises(ToolConfigurationUnavailableError):
        TOOL_REGISTRY.resolve_authorized_tools(
            [tool_name],
            authenticated_user_id=42,
        )


def test_tool_configuration_validation_rejects_unknown_and_duplicate_names() -> None:
    with pytest.raises(UnknownToolError):
        TOOL_REGISTRY.validate_enabled_configuration(["run_python"])

    with pytest.raises(InvalidToolConfigurationError):
        TOOL_REGISTRY.validate_enabled_configuration(
            ["search_documents", "search_documents"]
        )

    with pytest.raises(InvalidToolConfigurationError):
        TOOL_REGISTRY.validate_enabled_configuration("search_documents")


def test_authorized_resolution_returns_only_registered_tool_objects() -> None:
    resolved = TOOL_REGISTRY.resolve_authorized_tools(
        ["get_document_details", "extract_document_fields"],
        authenticated_user_id=42,
    )

    assert [tool.name for tool in resolved] == [
        "get_document_details",
        "extract_document_fields",
    ]
    assert (
        resolved[0]
        is TOOL_REGISTRY.get_registration("get_document_details").implementation
    )


def test_resolution_requires_authenticated_user_context() -> None:
    with pytest.raises(ToolAuthenticationRequiredError, match="authenticated user"):
        TOOL_REGISTRY.resolve_authorized_tools(
            ["search_documents"],
            authenticated_user_id=None,
        )


def test_empty_enabled_tool_configuration_resolves_to_empty_list() -> None:
    assert TOOL_REGISTRY.resolve_authorized_tools([], authenticated_user_id=None) == []


def test_missing_server_configuration_rejects_tool_resolution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "tavily_api_key", "")

    with pytest.raises(ToolConfigurationUnavailableError) as error:
        TOOL_REGISTRY.resolve_authorized_tools(
            ["search_web"],
            authenticated_user_id=42,
        )

    assert "not configured" in str(error.value)
    assert "TAVILY_API_KEY" not in str(error.value)


def test_approval_required_tool_is_rejected_by_custom_agent_runtime() -> None:
    with pytest.raises(ToolApprovalUnavailableError):
        TOOL_REGISTRY.resolve_authorized_tools(
            ["delete_document"],
            authenticated_user_id=42,
        )


def test_disabled_destructive_tool_stays_unavailable_to_custom_agents() -> None:
    assert (
        TOOL_REGISTRY.get_availability(
            "delete_document",
            custom_agent=True,
            human_approval_available=True,
        )
        is ToolAvailabilityStatus.DISABLED
    )
    with pytest.raises(ToolDisabledError):
        TOOL_REGISTRY.resolve_authorized_tools(
            ["delete_document"],
            authenticated_user_id=42,
            human_approval_available=True,
        )


def test_registry_can_describe_tools_in_the_startup_approval_runtime() -> None:
    assert TOOL_REGISTRY.is_available(
        "delete_document",
        custom_agent=False,
        human_approval_available=True,
    )

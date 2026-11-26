"""Metadata and permission-aware resolution for server-owned agent tools."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from langchain_core.tools import BaseTool

from app.core.config import Settings, settings
from app.services.agent_tools import (
    compare_documents,
    delete_document,
    extract_document_fields,
    generate_research_report,
    get_document_details,
    search_documents,
    search_web,
    summarize_document,
)


class ToolCategory(StrEnum):
    """Product-facing group for an existing server tool."""

    DOCUMENT_INTELLIGENCE = "document_intelligence"
    KNOWLEDGE_RETRIEVAL = "knowledge_retrieval"
    WEB_RESEARCH = "web_research"
    DOCUMENT_MANAGEMENT = "document_management"


class ToolRiskLevel(StrEnum):
    """Impact classification used when exposing tool metadata to operators."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    DESTRUCTIVE = "destructive"


class AuthenticationRequirement(StrEnum):
    NONE = "none"
    AUTHENTICATED_USER = "authenticated_user"


class ToolEffect(StrEnum):
    READ_ONLY = "read_only"
    SIDE_EFFECTING = "side_effecting"


class AvailabilityPolicy(StrEnum):
    ALWAYS = "always"
    SERVER_CONFIGURATION = "server_configuration"


class ServerConfiguration(StrEnum):
    GROQ_API_KEY = "GROQ_API_KEY"
    TAVILY_API_KEY = "TAVILY_API_KEY"


class ToolAvailabilityStatus(StrEnum):
    AVAILABLE = "available"
    MISSING_CONFIGURATION = "missing_configuration"
    APPROVAL_UNAVAILABLE = "approval_unavailable"
    DISABLED = "disabled"


class ToolRegistryError(ValueError):
    """Base error for invalid or unavailable server tool configuration."""


class DuplicateToolNameError(ToolRegistryError):
    """Raised when two registered tools share the same name."""


class UnknownToolError(ToolRegistryError):
    """Raised when saved configuration names a tool absent from the registry."""


class InvalidToolConfigurationError(ToolRegistryError):
    """Raised when enabled tool names are malformed or duplicated."""


class ToolAuthenticationRequiredError(ToolRegistryError):
    """Raised when resolution lacks the authenticated user's identity."""


class ToolApprovalUnavailableError(ToolRegistryError):
    """Raised when a requested tool requires an unsupported approval runtime."""


class ToolDisabledError(ToolRegistryError):
    """Raised when a registered tool is disabled for the requested runtime."""


class ToolConfigurationUnavailableError(ToolRegistryError):
    """Raised when server configuration required by a tool is missing."""


@dataclass(frozen=True)
class ToolMetadata:
    """Non-secret metadata and server-owned permission requirements."""

    name: str
    display_name: str
    description: str
    category: ToolCategory
    risk_level: ToolRiskLevel
    authentication: AuthenticationRequirement
    requires_human_approval: bool
    availability: AvailabilityPolicy
    required_server_configuration: tuple[ServerConfiguration, ...]
    effect: ToolEffect
    enabled_for_custom_agents: bool = True


@dataclass(frozen=True)
class ToolRegistration:
    """Pair a LangChain tool object with its trusted server metadata."""

    metadata: ToolMetadata
    implementation: BaseTool


def _metadata(
    tool: BaseTool,
    *,
    display_name: str,
    category: ToolCategory,
    risk_level: ToolRiskLevel,
    effect: ToolEffect = ToolEffect.READ_ONLY,
    requires_human_approval: bool = False,
    required_server_configuration: tuple[ServerConfiguration, ...] = (),
    enabled_for_custom_agents: bool = True,
) -> ToolRegistration:
    """Bind metadata to a concrete existing tool, never a user-supplied name."""

    return ToolRegistration(
        metadata=ToolMetadata(
            name=tool.name,
            display_name=display_name,
            description=tool.description,
            category=category,
            risk_level=risk_level,
            authentication=AuthenticationRequirement.AUTHENTICATED_USER,
            requires_human_approval=requires_human_approval,
            availability=(
                AvailabilityPolicy.SERVER_CONFIGURATION
                if required_server_configuration
                else AvailabilityPolicy.ALWAYS
            ),
            required_server_configuration=required_server_configuration,
            effect=effect,
            enabled_for_custom_agents=enabled_for_custom_agents,
        ),
        implementation=tool,
    )


class ToolRegistry:
    """Resolve only the fixed LangChain tools registered by the server."""

    def __init__(
        self,
        registrations: Sequence[ToolRegistration],
        *,
        settings_source: Settings = settings,
    ) -> None:
        self._settings = settings_source
        self._registrations: dict[str, ToolRegistration] = {}

        for registration in registrations:
            metadata = registration.metadata
            if metadata.name != registration.implementation.name:
                raise InvalidToolConfigurationError(
                    "Tool metadata must match the registered implementation."
                )
            if metadata.name in self._registrations:
                raise DuplicateToolNameError(
                    "Tool names must be unique in the server registry."
                )
            if not metadata.name.strip() or not metadata.description.strip():
                raise InvalidToolConfigurationError(
                    "Registered tools need a name and description."
                )
            if (
                metadata.availability is AvailabilityPolicy.ALWAYS
                and metadata.required_server_configuration
            ) or (
                metadata.availability is AvailabilityPolicy.SERVER_CONFIGURATION
                and not metadata.required_server_configuration
            ):
                raise InvalidToolConfigurationError(
                    "Tool availability must match its configuration requirements."
                )
            if (
                metadata.effect is ToolEffect.SIDE_EFFECTING
                and not metadata.requires_human_approval
            ):
                raise InvalidToolConfigurationError(
                    "Side-effecting tools must require human approval."
                )
            self._registrations[metadata.name] = registration

    def names(self) -> frozenset[str]:
        """Return all server-registered names for schema allowlist reuse."""

        return frozenset(self._registrations)

    def list_tools(self) -> tuple[ToolMetadata, ...]:
        """List non-secret metadata without exposing API credentials."""

        return tuple(
            registration.metadata for registration in self._registrations.values()
        )

    def get_metadata(self, name: str) -> ToolMetadata:
        """Return trusted metadata for a registered name."""

        return self.get_registration(name).metadata

    def get_registration(self, name: str) -> ToolRegistration:
        """Return the server-owned implementation/metadata pair."""

        try:
            return self._registrations[name]
        except KeyError:
            raise UnknownToolError("The requested tool is not registered.") from None

    def get_availability(
        self,
        name: str,
        *,
        custom_agent: bool = True,
        human_approval_available: bool = False,
    ) -> ToolAvailabilityStatus:
        """Compute runtime availability from trusted metadata and server config."""

        metadata = self.get_metadata(name)
        if metadata.requires_human_approval and human_approval_available is not True:
            return ToolAvailabilityStatus.APPROVAL_UNAVAILABLE
        if custom_agent is not False and not metadata.enabled_for_custom_agents:
            return ToolAvailabilityStatus.DISABLED

        for required in metadata.required_server_configuration:
            setting_name = required.value.lower()
            value = getattr(self._settings, setting_name, None)
            if not isinstance(value, str) or not value.strip():
                return ToolAvailabilityStatus.MISSING_CONFIGURATION

        return ToolAvailabilityStatus.AVAILABLE

    def is_available(
        self,
        name: str,
        *,
        custom_agent: bool = True,
        human_approval_available: bool = False,
    ) -> bool:
        """Return whether a registered tool can run in this execution context."""

        return (
            self.get_availability(
                name,
                custom_agent=custom_agent,
                human_approval_available=human_approval_available,
            )
            is ToolAvailabilityStatus.AVAILABLE
        )

    def validate_enabled_configuration(self, names: object) -> tuple[str, ...]:
        """Validate saved tool names without resolving arbitrary code or paths."""

        if not isinstance(names, list) or any(
            not isinstance(name, str) for name in names
        ):
            raise InvalidToolConfigurationError("Invalid enabled-tools setting.")
        if len(names) != len(set(names)):
            raise InvalidToolConfigurationError("Enabled tools contain duplicates.")

        unknown = set(names) - self.names()
        if unknown:
            raise UnknownToolError(
                "The saved configuration contains an unregistered tool."
            )
        return tuple(names)

    def resolve_authorized_tools(
        self,
        names: object,
        *,
        authenticated_user_id: int | None,
        custom_agent: bool = True,
        human_approval_available: bool = False,
    ) -> list[BaseTool]:
        """Resolve enabled names after auth and availability checks."""

        validated_names = self.validate_enabled_configuration(names)
        resolved: list[BaseTool] = []

        for name in validated_names:
            registration = self.get_registration(name)
            metadata = registration.metadata
            if (
                metadata.authentication is AuthenticationRequirement.AUTHENTICATED_USER
                and (
                    type(authenticated_user_id) is not int or authenticated_user_id < 1
                )
            ):
                raise ToolAuthenticationRequiredError(
                    "An authenticated user is required to resolve this tool."
                )

            availability = self.get_availability(
                name,
                custom_agent=custom_agent,
                human_approval_available=human_approval_available,
            )
            if availability is ToolAvailabilityStatus.APPROVAL_UNAVAILABLE:
                raise ToolApprovalUnavailableError(
                    "An enabled tool requires an approval runtime that is unavailable."
                )
            if availability is ToolAvailabilityStatus.DISABLED:
                raise ToolDisabledError(
                    "An enabled tool is disabled for this agent runtime."
                )
            if availability is ToolAvailabilityStatus.MISSING_CONFIGURATION:
                raise ToolConfigurationUnavailableError(
                    "An enabled tool is not configured on this server."
                )

            resolved.append(registration.implementation)

        return resolved

    def all_tools(self) -> tuple[BaseTool, ...]:
        """Return all registered implementations for the legacy startup graph."""

        return tuple(
            registration.implementation for registration in self._registrations.values()
        )


TOOL_REGISTRY = ToolRegistry(
    (
        _metadata(
            search_documents,
            display_name="Search documents",
            category=ToolCategory.KNOWLEDGE_RETRIEVAL,
            risk_level=ToolRiskLevel.LOW,
        ),
        _metadata(
            get_document_details,
            display_name="Get document details",
            category=ToolCategory.DOCUMENT_INTELLIGENCE,
            risk_level=ToolRiskLevel.LOW,
        ),
        _metadata(
            summarize_document,
            display_name="Summarize a document",
            category=ToolCategory.DOCUMENT_INTELLIGENCE,
            risk_level=ToolRiskLevel.MEDIUM,
            required_server_configuration=(ServerConfiguration.GROQ_API_KEY,),
        ),
        _metadata(
            compare_documents,
            display_name="Compare documents",
            category=ToolCategory.DOCUMENT_INTELLIGENCE,
            risk_level=ToolRiskLevel.MEDIUM,
            required_server_configuration=(ServerConfiguration.GROQ_API_KEY,),
        ),
        _metadata(
            extract_document_fields,
            display_name="Extracted document fields",
            category=ToolCategory.DOCUMENT_INTELLIGENCE,
            risk_level=ToolRiskLevel.LOW,
        ),
        _metadata(
            search_web,
            display_name="Search the web",
            category=ToolCategory.WEB_RESEARCH,
            risk_level=ToolRiskLevel.MEDIUM,
            required_server_configuration=(ServerConfiguration.TAVILY_API_KEY,),
        ),
        _metadata(
            generate_research_report,
            display_name="Generate a research report",
            category=ToolCategory.WEB_RESEARCH,
            risk_level=ToolRiskLevel.HIGH,
            required_server_configuration=(
                ServerConfiguration.GROQ_API_KEY,
                ServerConfiguration.TAVILY_API_KEY,
            ),
        ),
        _metadata(
            delete_document,
            display_name="Delete a document",
            category=ToolCategory.DOCUMENT_MANAGEMENT,
            risk_level=ToolRiskLevel.DESTRUCTIVE,
            effect=ToolEffect.SIDE_EFFECTING,
            requires_human_approval=True,
            enabled_for_custom_agents=False,
        ),
    ),
    settings_source=settings,
)

# Schemas and the dynamic factory derive their accepted names from this registry.
ALLOWED_AGENT_TOOLS = TOOL_REGISTRY.names()

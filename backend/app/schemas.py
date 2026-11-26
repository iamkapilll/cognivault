"""Shared Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.agent_config import (
    ALLOWED_AGENT_TOOLS,
    DEFAULT_AGENT_MODEL,
    DEFAULT_AGENT_PROVIDER,
    DEFAULT_AGENT_TEMPERATURE,
    SUPPORTED_AGENT_MODELS,
    validate_model_configuration,
)
from app.core.config import settings


class DocumentCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=255)


class DocumentResponse(BaseModel):
    id: int
    filename: str
    status: str
    page_count: int | None = None
    extraction_method: str | None = None
    document_type: str | None = None
    review_status: str = "not_reviewed"
    index_status: str = "not_indexed"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentTextResponse(DocumentResponse):
    extracted_text: str | None = None


class DocumentAnalysisResponse(DocumentResponse):
    extracted_fields: dict[str, Any]


class ConversationCreate(BaseModel):
    document_ids: list[int] = Field(default_factory=list, max_length=20)
    title: str | None = Field(default=None, max_length=120)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class ConversationResponse(BaseModel):
    id: int
    thread_id: str
    title: str
    document_ids: list[int]
    created_at: datetime
    updated_at: datetime
    preview: str | None = None


class StoredMessage(BaseModel):
    role: str
    content: str
    created_at: datetime | None = None


class ApprovalInfo(BaseModel):
    action: str
    document_id: int
    filename: str
    message: str


class AgentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    system_prompt: str = Field(min_length=1, max_length=12000)
    model_provider: str = Field(
        default=DEFAULT_AGENT_PROVIDER,
        min_length=1,
        max_length=32,
    )
    model_name: str = Field(
        default=DEFAULT_AGENT_MODEL,
        min_length=1,
        max_length=120,
    )
    temperature: float = Field(default=DEFAULT_AGENT_TEMPERATURE, ge=0.0, le=2.0)
    enabled_tools: list[str] = Field(
        default_factory=list,
        max_length=len(ALLOWED_AGENT_TOOLS),
    )
    memory_enabled: bool = False
    human_approval_required: bool = False
    is_active: bool = True

    @field_validator("name", "system_prompt")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("model_provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        if value not in SUPPORTED_AGENT_MODELS:
            raise ValueError("unsupported model provider")
        return value

    @field_validator("model_name")
    @classmethod
    def validate_model_name(cls, value: str) -> str:
        if not any(value in models for models in SUPPORTED_AGENT_MODELS.values()):
            raise ValueError("unsupported model name")
        return value

    @field_validator("enabled_tools")
    @classmethod
    def validate_tool_names(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("enabled_tools must not contain duplicates")
        unknown = set(value) - ALLOWED_AGENT_TOOLS
        if unknown:
            raise ValueError("enabled_tools contains an unsupported tool")
        return value

    @model_validator(mode="after")
    def validate_model_pair(self) -> AgentCreate:
        validate_model_configuration(
            self.model_provider,
            self.model_name,
            temperature=self.temperature,
            require_tool_calling=bool(self.enabled_tools),
        )
        return self


class AgentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    system_prompt: str | None = Field(default=None, min_length=1, max_length=12000)
    model_provider: str | None = Field(default=None, min_length=1, max_length=32)
    model_name: str | None = Field(default=None, min_length=1, max_length=120)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    enabled_tools: list[str] | None = Field(
        default=None,
        max_length=len(ALLOWED_AGENT_TOOLS),
    )
    memory_enabled: bool | None = None
    human_approval_required: bool | None = None
    is_active: bool | None = None

    @field_validator("name", "system_prompt")
    @classmethod
    def reject_blank_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("model_provider")
    @classmethod
    def validate_provider(cls, value: str | None) -> str | None:
        if value is not None and value not in SUPPORTED_AGENT_MODELS:
            raise ValueError("unsupported model provider")
        return value

    @field_validator("model_name")
    @classmethod
    def validate_model_name(cls, value: str | None) -> str | None:
        if value is not None and not any(
            value in models for models in SUPPORTED_AGENT_MODELS.values()
        ):
            raise ValueError("unsupported model name")
        return value

    @field_validator("enabled_tools")
    @classmethod
    def validate_tool_names(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        if len(value) != len(set(value)):
            raise ValueError("enabled_tools must not contain duplicates")
        unknown = set(value) - ALLOWED_AGENT_TOOLS
        if unknown:
            raise ValueError("enabled_tools contains an unsupported tool")
        return value

    @model_validator(mode="after")
    def validate_patch(self) -> AgentUpdate:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")

        non_nullable_fields = {
            "name",
            "system_prompt",
            "model_provider",
            "model_name",
            "temperature",
            "enabled_tools",
            "memory_enabled",
            "human_approval_required",
            "is_active",
        }
        for field_name in non_nullable_fields & self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")

        if self.model_provider is not None and self.model_name is not None:
            validate_model_configuration(
                self.model_provider,
                self.model_name,
                temperature=self.temperature,
                require_tool_calling=bool(self.enabled_tools),
            )
        return self


class AgentResponse(BaseModel):
    id: int
    user_id: int
    name: str
    description: str | None
    system_prompt: str
    model_provider: str
    model_name: str
    temperature: float
    enabled_tools: list[str]
    memory_enabled: bool
    human_approval_required: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int


class AgentModelMetadata(BaseModel):
    model_name: str
    supports_tool_calling: bool
    temperature_min: float
    temperature_max: float


class AgentProviderMetadata(BaseModel):
    provider: str
    display_name: str
    available: bool
    availability_status: str
    models: list[AgentModelMetadata]


class AgentToolMetadata(BaseModel):
    name: str
    display_name: str
    description: str
    category: str
    risk_level: str
    effect: str
    requires_authenticated_user: bool
    requires_human_approval: bool
    requires_memory: bool
    available: bool
    availability_status: str


class AgentConfigurationMetadata(BaseModel):
    providers: list[AgentProviderMetadata]
    tools: list[AgentToolMetadata]
    default_model_provider: str
    default_model_name: str
    default_temperature: float


class AgentConversationCreate(BaseModel):
    """Optional metadata used to create a persistent custom-agent thread."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=120)
    document_ids: list[Annotated[int, Field(ge=1)]] = Field(
        default_factory=list,
        max_length=settings.custom_agent_max_documents,
    )

    @field_validator("title")
    @classmethod
    def reject_blank_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value

    @field_validator("document_ids")
    @classmethod
    def reject_duplicate_documents(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("document_ids must not contain duplicates")
        return value


class AgentConversationRename(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def reject_blank_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value


class AgentConversationResponse(BaseModel):
    id: int
    agent_id: int
    title: str
    document_ids: list[int]
    created_at: datetime
    updated_at: datetime


class AgentConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentConversationMessagesResponse(BaseModel):
    conversation_id: int
    total: int
    offset: int
    limit: int
    messages: list[AgentConversationMessage]


class AgentConversationListResponse(BaseModel):
    conversations: list[AgentConversationResponse]
    total: int
    offset: int
    limit: int


class AgentInvokeRequest(BaseModel):
    """Untrusted user input for a stateless or memory-backed agent run."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(
        min_length=1,
        max_length=settings.custom_agent_max_message_length,
    )
    document_ids: list[Annotated[int, Field(ge=1)]] | None = Field(
        default=None,
        max_length=settings.custom_agent_max_documents,
    )
    conversation_id: int | None = Field(default=None, ge=1)

    @field_validator("message")
    @classmethod
    def reject_blank_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be blank")
        return value

    @field_validator("document_ids")
    @classmethod
    def reject_duplicate_documents(
        cls,
        value: list[int] | None,
    ) -> list[int] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("document_ids must not contain duplicates")
        return value


class AgentInvokeResponse(BaseModel):
    run_id: str
    agent_id: int
    response: str
    conversation_id: int | None = None


class AgentApprovalSummary(BaseModel):
    id: UUID
    agent_id: int
    conversation_id: int
    run_id: str
    tool_name: str
    status: Literal[
        "pending",
        "approved",
        "rejected",
        "executing",
        "executed",
        "expired",
        "invalidated",
        "execution_uncertain",
    ]
    action_summary: str
    created_at: datetime
    expires_at: datetime
    decided_at: datetime | None = None
    executed_at: datetime | None = None


class AgentApprovalListResponse(BaseModel):
    approvals: list[AgentApprovalSummary]
    total: int


class AgentApprovalDecisionResponse(BaseModel):
    approval: AgentApprovalSummary


class AgentInvokePendingResponse(BaseModel):
    run_id: str
    agent_id: int
    conversation_id: int
    status: Literal["approval_required"] = "approval_required"
    approval: AgentApprovalSummary


AgentInvokeResult = AgentInvokeResponse | AgentInvokePendingResponse


class AgentRunStartedEvent(BaseModel):
    type: Literal["run_started"] = "run_started"
    run_id: str
    agent_id: int
    conversation_id: int | None = None


class AgentTextDeltaEvent(BaseModel):
    type: Literal["text_delta"] = "text_delta"
    run_id: str
    text: str


class AgentToolStartedEvent(BaseModel):
    type: Literal["tool_started"] = "tool_started"
    run_id: str
    tool_name: str


class AgentToolCompletedEvent(BaseModel):
    type: Literal["tool_completed"] = "tool_completed"
    run_id: str
    tool_name: str


class AgentRunCompletedEvent(BaseModel):
    type: Literal["run_completed"] = "run_completed"
    run_id: str


class AgentApprovalRequiredEvent(BaseModel):
    type: Literal["approval_required"] = "approval_required"
    run_id: str
    agent_id: int
    conversation_id: int
    approval: AgentApprovalSummary


class AgentRunPausedEvent(BaseModel):
    type: Literal["run_paused"] = "run_paused"
    run_id: str
    approval_id: UUID


class AgentRunResumedEvent(BaseModel):
    type: Literal["run_resumed"] = "run_resumed"
    run_id: str
    approval_id: UUID


class AgentApprovalRejectedEvent(BaseModel):
    type: Literal["approval_rejected"] = "approval_rejected"
    run_id: str
    approval_id: UUID
    tool_name: str


class AgentExecutionErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    run_id: str
    code: str
    message: str


AgentStreamEvent = Annotated[
    (
        AgentRunStartedEvent
        | AgentTextDeltaEvent
        | AgentToolStartedEvent
        | AgentToolCompletedEvent
        | AgentRunCompletedEvent
        | AgentApprovalRequiredEvent
        | AgentRunPausedEvent
        | AgentRunResumedEvent
        | AgentApprovalRejectedEvent
        | AgentExecutionErrorEvent
    ),
    Field(discriminator="type"),
]

"""Shared Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.agent_config import (
    ALLOWED_AGENT_TOOLS,
    DEFAULT_AGENT_MODEL,
    DEFAULT_AGENT_PROVIDER,
    SUPPORTED_AGENT_MODELS,
    validate_model_configuration,
)


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
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
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

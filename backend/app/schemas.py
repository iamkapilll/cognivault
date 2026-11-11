"""Shared Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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

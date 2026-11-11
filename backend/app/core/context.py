"""Request-scoped context used by LangGraph tools.

Tools are module-level callables, so the authenticated user, the documents
selected for the current conversation and a human-readable description of
those documents are carried through context variables instead of global
state.
"""

from __future__ import annotations

from contextvars import ContextVar

current_user_id: ContextVar[int | None] = ContextVar("current_user_id", default=None)
current_document_ids: ContextVar[tuple[int, ...]] = ContextVar(
    "current_document_ids", default=()
)
current_document_context: ContextVar[str] = ContextVar(
    "current_document_context", default=""
)


def get_context_user_id() -> int | None:
    return current_user_id.get()


def get_context_document_ids() -> tuple[int, ...]:
    return current_document_ids.get()


def get_context_document_context() -> str:
    return current_document_context.get()

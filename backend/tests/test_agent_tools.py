"""Tool authentication guards.

Tools read the caller from a request-scoped ContextVar. Without an active
request context every tool must refuse to touch data.
"""

from __future__ import annotations

import pytest

from app.services.agent_tools import (
    compare_documents,
    delete_document,
    extract_document_fields,
    generate_research_report,
    get_document_details,
    search_documents,
    summarize_document,
)


@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        (search_documents, {"query": "invoice"}),
        (get_document_details, {"document_id": 1}),
        (summarize_document, {"document_id": 1}),
        (
            compare_documents,
            {"first_document_id": 1, "second_document_id": 2},
        ),
        (extract_document_fields, {"document_id": 1}),
        (generate_research_report, {"topic": "payments"}),
        (delete_document, {"document_id": 1}),
    ],
)
def test_tools_refuse_to_run_without_an_authenticated_user(tool, arguments):
    assert tool.invoke(arguments) == "Not authenticated."

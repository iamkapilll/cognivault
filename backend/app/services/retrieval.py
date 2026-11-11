"""User-scoped vector retrieval shared by the RAG API and agent tools."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Document, DocumentChunk
from app.services.rag_service import embed_query


def retrieve_chunks(
    db: Session,
    *,
    question: str,
    user_id: int,
    document_ids: list[int] | tuple[int, ...] | None = None,
    top_k: int = 4,
    max_distance: float | None = None,
) -> list[dict]:
    """Return relevant chunks owned by ``user_id``.

    Ownership is enforced in SQL, so a forged document id cannot leak
    another user's content.
    """

    threshold = settings.rag_max_distance if max_distance is None else max_distance

    question_embedding = embed_query(question)
    distance = DocumentChunk.embedding.cosine_distance(question_embedding)

    statement = (
        select(
            DocumentChunk,
            Document.filename,
            distance.label("distance"),
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(Document.user_id == user_id)
        .where(distance <= threshold)
    )

    if document_ids:
        statement = statement.where(Document.id.in_(list(document_ids)))

    statement = statement.order_by(distance).limit(max(1, min(top_k, 8)))

    results = db.execute(statement).all()

    return [
        {
            "document_id": chunk.document_id,
            "filename": filename,
            "chunk_index": chunk.chunk_index,
            "content": chunk.content,
            "distance": float(score),
        }
        for chunk, filename, score in results
    ]

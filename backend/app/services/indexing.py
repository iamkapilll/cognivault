"""Chunking and embedding pipeline for a single document."""

from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import Document, DocumentChunk
from app.services.rag_service import embed_documents, split_text


def index_document(db: Session, document: Document) -> int:
    """Replace a document's chunks with freshly embedded ones.

    Returns the number of chunks created. Raises ValueError when the
    document has no usable text.
    """

    if not document.extracted_text or not document.extracted_text.strip():
        raise ValueError("Document has no extracted text to index")

    chunks = split_text(document.extracted_text)

    if not chunks:
        raise ValueError("No usable text chunks")

    embeddings = embed_documents(chunks)

    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))

    for index, (content, embedding) in enumerate(zip(chunks, embeddings, strict=True)):
        db.add(
            DocumentChunk(
                document_id=document.id,
                chunk_index=index,
                content=content,
                embedding=embedding,
            )
        )

    document.index_status = "indexed"
    db.commit()

    return len(chunks)

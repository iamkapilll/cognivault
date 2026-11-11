"""RAG indexing and question answering (user-scoped)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from groq import APIError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import User
from app.routers.documents import get_owned_document
from app.services.indexing import index_document
from app.services.llm_service import generate_answer
from app.services.retrieval import retrieve_chunks

router = APIRouter(prefix="/rag", tags=["RAG"])


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    document_id: int | None = None
    document_ids: list[int] | None = Field(default=None, max_length=20)
    top_k: int = Field(default=4, ge=1, le=8)


class SourceResponse(BaseModel):
    document_id: int
    filename: str
    chunk_index: int
    content: str
    distance: float


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceResponse]


@router.post("/index/{document_id}")
def index_document_endpoint(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document(db, document_id, current_user)

    try:
        chunks_created = index_document(db, document)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            502, "Embedding generation failed. Try again later."
        ) from exc

    return {
        "message": "Document indexed successfully",
        "document_id": document_id,
        "chunks_created": chunks_created,
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
    }


@router.post("/ask", response_model=AskResponse)
def ask_question(
    data: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document_ids = list(data.document_ids or [])

    if data.document_id is not None:
        document_ids.append(data.document_id)

    document_ids = list(dict.fromkeys(document_ids))

    # Ownership check for every explicitly requested document.
    for document_id in document_ids:
        get_owned_document(db, document_id, current_user)

    sources = retrieve_chunks(
        db=db,
        question=data.question,
        user_id=current_user.id,
        document_ids=document_ids or None,
        top_k=data.top_k,
        max_distance=settings.rag_max_distance,
    )

    if not sources:
        return {
            "answer": (
                "No relevant indexed passages were found in your "
                "documents. Index a document first, or rephrase the "
                "question."
            ),
            "sources": [],
        }

    try:
        answer = generate_answer(data.question, sources)
    except (APIError, RuntimeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Answer generation failed. Try again later.",
        ) from exc

    return {"answer": answer, "sources": sources}

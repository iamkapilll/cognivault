"""Document upload, listing, inspection and deletion (user-scoped)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from uuid import uuid4

import pymupdf
import pytesseract
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from PIL import Image, UnidentifiedImageError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import Document, DocumentChunk, User
from app.schemas import (
    DocumentAnalysisResponse,
    DocumentCreate,
    DocumentResponse,
    DocumentTextResponse,
)
from app.services.document_analysis import analyze_document
from app.services.indexing import index_document
from app.services.ocr_service import extract_document
from app.services.uploads import (
    UPLOAD_DIR,
    has_allowed_extension,
    safe_upload_path,
    sanitize_filename,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = settings.max_file_size
CHUNK_SIZE = 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000


def get_owned_document(
    db: Session,
    document_id: int,
    user: User,
) -> Document:
    """Fetch a document or raise 404 for missing *and* foreign documents.

    Returning 404 instead of 403 avoids leaking the existence of another
    user's document ids (IDOR / enumeration).
    """

    document = db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == user.id,
        )
    )

    if document is None:
        raise HTTPException(404, "Document not found")

    return document


@router.post("", response_model=DocumentResponse, status_code=201)
def create_document(
    data: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = Document(filename=data.filename, user_id=current_user.id)
    db.add(document)

    try:
        db.commit()
        db.refresh(document)
    except Exception:
        db.rollback()
        raise

    return document


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    auto_index: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename = sanitize_filename(file.filename or "")
    extension = Path(filename).suffix.lower()

    if not filename or not has_allowed_extension(filename) or len(filename) > 255:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, JPG, JPEG, and PNG files are allowed.",
        )

    file_path = UPLOAD_DIR / f"{uuid4().hex}{extension}"

    try:
        size = 0

        with file_path.open("wb") as destination:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)

                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"Maximum file size is {MAX_FILE_SIZE // (1024 * 1024)} MB."
                        ),
                    )

                destination.write(chunk)

        if size == 0:
            raise HTTPException(status_code=400, detail="Empty files are not allowed.")

        # Verify content, not only the file extension.
        if extension == ".pdf":
            with file_path.open("rb") as source:
                if source.read(5) != b"%PDF-":
                    raise HTTPException(status_code=400, detail="Invalid PDF file.")
        else:
            try:
                with Image.open(file_path) as image:
                    if image.format not in {"JPEG", "PNG"}:
                        raise ValueError("Unsupported image format")
                    if image.width * image.height > MAX_IMAGE_PIXELS:
                        raise ValueError("Image dimensions are too large")
                    image.verify()
            except (UnidentifiedImageError, ValueError, OSError) as exc:
                raise HTTPException(
                    status_code=400, detail="Invalid image file."
                ) from exc

        # Extraction, OCR and embedding are CPU-bound; keep them off the
        # event loop so other requests stay responsive.
        text, page_count, method = await run_in_threadpool(
            extract_document, file_path, extension
        )
        document_type, fields, review_status = analyze_document(text)

        document = Document(
            user_id=current_user.id,
            filename=filename,
            file_path=str(file_path),
            extracted_text=text,
            page_count=page_count,
            extraction_method=method,
            document_type=document_type,
            extracted_fields=json.dumps(fields),
            review_status=review_status,
            status="completed" if text else "needs_review",
            index_status="not_indexed",
        )

        db.add(document)
        db.commit()
        db.refresh(document)

        if auto_index and text.strip():
            try:
                await run_in_threadpool(index_document, db, document)
            except Exception:
                db.rollback()
                logger.exception(
                    "Automatic indexing failed for document %s",
                    document.id,
                )
                document.index_status = "failed"
                db.commit()

        return document

    except HTTPException:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise

    except (
        ValueError,
        pymupdf.FileDataError,
        pytesseract.TesseractError,
        pytesseract.TesseractNotFoundError,
        RuntimeError,
        OSError,
        Image.DecompressionBombError,
    ) as exc:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail="Document processing failed. Check the file and try again.",
        ) from exc

    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise

    finally:
        await file.close()


@router.get("", response_model=list[DocumentResponse])
def get_documents(
    q: str | None = Query(default=None, max_length=100),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = select(Document).where(Document.user_id == current_user.id)

    if q:
        statement = statement.where(Document.filename.ilike(f"%{q.strip()}%"))

    if status_filter:
        statement = statement.where(Document.status == status_filter)

    return db.scalars(statement.order_by(Document.id.desc())).all()


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_owned_document(db, document_id, current_user)


@router.get("/{document_id}/text", response_model=DocumentTextResponse)
def get_document_text(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_owned_document(db, document_id, current_user)


@router.get(
    "/{document_id}/analysis",
    response_model=DocumentAnalysisResponse,
)
def get_document_analysis(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document(db, document_id, current_user)

    return {
        "id": document.id,
        "filename": document.filename,
        "status": document.status,
        "page_count": document.page_count,
        "extraction_method": document.extraction_method,
        "document_type": document.document_type,
        "review_status": document.review_status,
        "index_status": document.index_status,
        "created_at": document.created_at,
        "extracted_fields": json.loads(document.extracted_fields or "{}"),
    }


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document(db, document_id, current_user)
    file_path = safe_upload_path(document.file_path)
    filename = document.filename

    # Chunks are removed by the ON DELETE CASCADE constraint.
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
    db.delete(document)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    if file_path is not None:
        try:
            file_path.unlink(missing_ok=True)
        except OSError:
            logger.warning(
                "Document %s deleted but file cleanup failed: %s",
                document_id,
                file_path,
            )

    return {"message": f"Document '{filename}' deleted"}

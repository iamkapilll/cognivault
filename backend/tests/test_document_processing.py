"""Smoke tests for native PDF extraction and the OCR fallback path."""

from __future__ import annotations

from pathlib import Path

import pymupdf
import pytest

from app.services.ocr_service import extract_document


def create_pdf(path: Path, *, text: str = "") -> Path:
    document = pymupdf.open()
    page = document.new_page()
    if text:
        page.insert_text((72, 72), text)
    document.save(path)
    document.close()
    return path


def test_pdf_text_is_extracted_without_ocr(tmp_path: Path) -> None:
    expected = "Cognivault extracts this selectable text directly from the PDF."
    pdf_path = create_pdf(tmp_path / "native.pdf", text=expected)

    extracted_text, page_count, method = extract_document(pdf_path, ".pdf")

    assert extracted_text == expected
    assert page_count == 1
    assert method == "pymupdf"


def test_scanned_pdf_uses_the_ocr_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pdf_path = create_pdf(tmp_path / "scanned.pdf")
    monkeypatch.setattr(
        "app.services.ocr_service.ocr_image",
        lambda image: "OCR extracted text.",
    )

    extracted_text, page_count, method = extract_document(pdf_path, ".pdf")

    assert extracted_text == "OCR extracted text."
    assert page_count == 1
    assert method == "tesseract"

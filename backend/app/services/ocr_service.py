"""OCR and native text extraction for PDFs and images."""

from __future__ import annotations

from pathlib import Path

import pymupdf
import pytesseract
from PIL import Image, ImageOps

from app.core.config import settings

if settings.tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


def ocr_image(image: Image.Image) -> str:
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")

    return pytesseract.image_to_string(
        image,
        lang="eng",
        config="--psm 3",
        timeout=30,
    ).strip()


def extract_document(
    file_path: Path,
    extension: str,
) -> tuple[str, int, str]:
    """Return (extracted_text, page_count, extraction_method)."""

    if extension in {".jpg", ".jpeg", ".png"}:
        with Image.open(file_path) as image:
            text = ocr_image(image)

        return text, 1, "tesseract"

    if extension != ".pdf":
        raise ValueError("Unsupported document type")

    pages_text: list[str] = []
    used_ocr = False
    used_native_text = False

    with pymupdf.open(file_path) as pdf:
        if not pdf.is_pdf:
            raise ValueError("Invalid PDF")

        if pdf.needs_pass:
            raise ValueError("Password-protected PDF")

        page_count = len(pdf)

        if page_count > settings.max_pdf_pages:
            raise ValueError(f"Maximum {settings.max_pdf_pages} PDF pages allowed")

        for page in pdf:
            text = page.get_text("text").strip()

            if len(text) >= 30:
                used_native_text = True
            else:
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(2, 2),
                    alpha=False,
                )

                image = Image.frombytes(
                    "RGB",
                    (pixmap.width, pixmap.height),
                    pixmap.samples,
                )

                ocr_text = ocr_image(image)

                if ocr_text:
                    text = ocr_text
                    used_ocr = True

            pages_text.append(text)

    if used_ocr and used_native_text:
        method = "hybrid"
    elif used_ocr:
        method = "tesseract"
    else:
        method = "pymupdf"

    return "\n\n".join(pages_text).strip(), page_count, method

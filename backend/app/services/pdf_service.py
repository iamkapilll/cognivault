from pathlib import Path

import pymupdf


def extract_pdf_text(file_path: Path) -> tuple[str, int]:
    """Extract selectable text and page count from a PDF."""

    with pymupdf.open(file_path) as pdf:
        if not pdf.is_pdf:
            raise ValueError("The uploaded file is not a PDF.")

        if pdf.needs_pass:
            raise ValueError("Password-protected PDFs are not supported.")

        page_count = len(pdf)
        pages = []

        for page in pdf:
            pages.append(page.get_text("text"))

    extracted_text = "\n\n".join(pages).strip()

    return extracted_text, page_count

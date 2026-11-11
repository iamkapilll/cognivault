"""Upload filename and storage-path safety helpers."""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
UPLOAD_DIR = settings.upload_dir


def sanitize_filename(filename: str) -> str:
    """Reduce a client-supplied name to a bare basename.

    Both POSIX and Windows separators are normalized so a crafted name
    such as ``..\\..\\secret.pdf`` cannot escape the upload directory.
    """

    return Path(filename.replace("\\", "/")).name.strip()


def has_allowed_extension(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def safe_upload_path(file_path: str | None) -> Path | None:
    """Return a resolved path only when it is inside the upload directory."""

    if not file_path:
        return None

    candidate = Path(file_path).resolve()

    if not candidate.is_relative_to(UPLOAD_DIR.resolve()):
        return None

    return candidate

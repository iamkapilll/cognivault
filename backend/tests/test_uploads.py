"""Filename and storage-path hardening for uploads."""

from __future__ import annotations

from pathlib import Path

from app.services.uploads import (
    UPLOAD_DIR,
    has_allowed_extension,
    safe_upload_path,
    sanitize_filename,
)


def test_windows_separators_are_stripped():
    assert sanitize_filename(r"..\..\Windows\system.ini") == "system.ini"


def test_posix_separators_are_stripped():
    assert sanitize_filename("../../etc/passwd") == "passwd"


def test_bare_filenames_are_preserved():
    assert sanitize_filename("report 2026.pdf") == "report 2026.pdf"


def test_absolute_paths_reduce_to_a_basename():
    assert sanitize_filename("/var/tmp/invoice.png") == "invoice.png"


def test_allowed_extensions_are_case_insensitive():
    assert has_allowed_extension("scan.PDF") is True
    assert has_allowed_extension("photo.jpeg") is True
    assert has_allowed_extension("photo.png") is True


def test_disallowed_extensions_are_rejected():
    assert has_allowed_extension("payload.exe") is False
    assert has_allowed_extension("notes.txt") is False
    assert has_allowed_extension("archive.pdf.zip") is False


def test_paths_inside_upload_dir_are_accepted(tmp_path):
    inside = UPLOAD_DIR / "example-file.pdf"

    assert safe_upload_path(str(inside)) == inside.resolve()


def test_paths_outside_upload_dir_are_rejected():
    outside = Path(__file__).resolve()

    assert safe_upload_path(str(outside)) is None


def test_empty_path_is_rejected():
    assert safe_upload_path(None) is None
    assert safe_upload_path("") is None


def test_relative_traversal_is_rejected():
    traversal = UPLOAD_DIR / ".." / "secrets.env"

    assert safe_upload_path(str(traversal)) is None

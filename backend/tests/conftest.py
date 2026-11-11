"""Shared pytest configuration.

Environment defaults are applied before any application module is imported,
so the suite never depends on the developer's real ``.env`` secrets or on a
reachable database. Endpoint tests that reach the database are intentionally
kept out of the unit suite; ownership checks were verified against the live
Neon database during development (see README.md).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault(
    "JWT_SECRET_KEY", "test-only-secret-key-with-more-than-32-characters"
)
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://test:test@127.0.0.1:5432/cognivault_test",
)
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("PRODUCTION", "false")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("TAVILY_API_KEY", "test-tavily-key")

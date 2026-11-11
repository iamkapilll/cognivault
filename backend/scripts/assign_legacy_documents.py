"""Assign pre-ownership documents to one explicit account.

Documents created before the ownership migration have ``user_id = NULL`` and
are intentionally invisible to every account. This operator script is the only
way to hand those legacy rows to a user. Nothing is assigned implicitly, and a
document that already has an owner is never re-assigned.

Run from the ``backend`` directory:

    python scripts/assign_legacy_documents.py --email you@example.com --dry-run
    python scripts/assign_legacy_documents.py --email you@example.com
    python scripts/assign_legacy_documents.py --email you@example.com --document-id 3
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Document, User  # noqa: E402

logger = logging.getLogger("assign_legacy_documents")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Give unowned (legacy) documents an explicit owner.",
    )
    parser.add_argument(
        "--email",
        required=True,
        help="Email of the account that should own the documents.",
    )
    parser.add_argument(
        "--document-id",
        type=int,
        action="append",
        default=None,
        help="Limit the assignment to these document IDs (repeatable).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing to the database.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    settings.validate()

    args = parse_args(argv)

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.lower()))

        if user is None:
            logger.error("No user with email %s. Nothing changed.", args.email)
            return 1

        query = select(Document).where(Document.user_id.is_(None))

        if args.document_id:
            query = query.where(Document.id.in_(args.document_id))

        documents = db.scalars(query.order_by(Document.id)).all()

        if not documents:
            logger.info("No unowned documents matched. Nothing changed.")
            return 0

        for document in documents:
            logger.info(
                "document %s (%s) -> %s",
                document.id,
                document.filename,
                user.email,
            )

            if not args.dry_run:
                document.user_id = user.id

        if args.dry_run:
            logger.info("Dry run: %s document(s) would be assigned.", len(documents))
            return 0

        db.commit()
        logger.info("Assigned %s document(s) to %s.", len(documents), user.email)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

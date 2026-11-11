
"""create document chunks vector table

Revision ID: 100adbf8593d
Revises: 0998f4524edc
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# Alembic revision identifiers
revision: str = "100adbf8593d"
down_revision: Union[str, Sequence[str], None] = "0998f4524edc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ensure pgvector extension exists
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Create document chunks table
    op.create_table(
        "document_chunks",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),

        sa.Column(
            "document_id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "chunk_index",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "content",
            sa.Text(),
            nullable=False,
        ),

        sa.Column(
            "embedding",
            Vector(384),
            nullable=False,
        ),

        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            ondelete="CASCADE",
        ),

        sa.UniqueConstraint(
            "document_id",
            "chunk_index",
            name="uq_document_chunk_index",
        ),
    )

    op.create_index(
        "ix_document_chunks_document_id",
        "document_chunks",
        ["document_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_chunks_document_id",
        table_name="document_chunks",
    )

    op.drop_table("document_chunks")

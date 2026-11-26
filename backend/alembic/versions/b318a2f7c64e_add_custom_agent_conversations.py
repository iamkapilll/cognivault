"""associate conversations with custom agents

Revision ID: b318a2f7c64e
Revises: 80b5abdab627
Create Date: 2026-11-26

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b318a2f7c64e"
down_revision: str | Sequence[str] | None = "80b5abdab627"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable by design: legacy conversation rows stay attached only to their
    # existing owner and are not assigned to any custom agent.
    op.add_column(
        "conversations",
        sa.Column("agent_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_conversations_agent_id_agents",
        "conversations",
        "agents",
        ["agent_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_conversations_agent_id",
        "conversations",
        ["agent_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_agent_id", table_name="conversations")
    op.drop_constraint(
        "fk_conversations_agent_id_agents",
        "conversations",
        type_="foreignkey",
    )
    op.drop_column("conversations", "agent_id")

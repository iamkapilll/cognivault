"""add durable custom-agent approvals and audit events

Revision ID: f6a71d9c2b40
Revises: b318a2f7c64e
Create Date: 2026-11-26

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f6a71d9c2b40"
down_revision: str | Sequence[str] | None = "b318a2f7c64e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_approvals",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("tool_call_id", sa.String(length=128), nullable=False),
        sa.Column("tool_name", sa.String(length=80), nullable=False),
        sa.Column("validated_arguments", sa.JSON(), nullable=False),
        sa.Column("arguments_sha256", sa.String(length=64), nullable=False),
        sa.Column("context_document_ids", sa.JSON(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=24),
            server_default="pending",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["conversations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id",
            "run_id",
            "tool_call_id",
            name="uq_agent_approval_run_tool_call",
        ),
    )
    op.create_index("ix_agent_approvals_user_id", "agent_approvals", ["user_id"])
    op.create_index("ix_agent_approvals_agent_id", "agent_approvals", ["agent_id"])
    op.create_index(
        "ix_agent_approvals_conversation_id", "agent_approvals", ["conversation_id"]
    )
    op.create_index("ix_agent_approvals_run_id", "agent_approvals", ["run_id"])

    op.create_table(
        "agent_audit_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=True),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("approval_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("tool_name", sa.String(length=80), nullable=True),
        sa.Column("event_type", sa.String(length=48), nullable=False),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column(
            "safe_metadata",
            sa.JSON(),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_audit_events_user_id", "agent_audit_events", ["user_id"])
    op.create_index(
        "ix_agent_audit_events_agent_id", "agent_audit_events", ["agent_id"]
    )
    op.create_index(
        "ix_agent_audit_events_conversation_id",
        "agent_audit_events",
        ["conversation_id"],
    )
    op.create_index(
        "ix_agent_audit_events_event_type", "agent_audit_events", ["event_type"]
    )
    op.create_index(
        "ix_agent_audit_events_created_at", "agent_audit_events", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_agent_audit_events_created_at", table_name="agent_audit_events")
    op.drop_index("ix_agent_audit_events_event_type", table_name="agent_audit_events")
    op.drop_index(
        "ix_agent_audit_events_conversation_id", table_name="agent_audit_events"
    )
    op.drop_index("ix_agent_audit_events_agent_id", table_name="agent_audit_events")
    op.drop_index("ix_agent_audit_events_user_id", table_name="agent_audit_events")
    op.drop_table("agent_audit_events")

    op.drop_index("ix_agent_approvals_run_id", table_name="agent_approvals")
    op.drop_index("ix_agent_approvals_conversation_id", table_name="agent_approvals")
    op.drop_index("ix_agent_approvals_agent_id", table_name="agent_approvals")
    op.drop_index("ix_agent_approvals_user_id", table_name="agent_approvals")
    op.drop_table("agent_approvals")

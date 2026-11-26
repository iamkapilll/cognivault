"""Persistent approval state and safe audit helpers for custom agents."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid5

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import AgentApproval, AgentAuditEvent, Document, User
from app.services.agent_guardrails import filter_sensitive_output

APPROVAL_NAMESPACE = UUID("8d19503e-8679-45bc-85b8-ad716ad20d21")
APPROVAL_TTL = timedelta(minutes=15)


class ApprovalStateError(RuntimeError):
    """A stored approval does not match the graph's exact interrupted call."""


def as_utc(value: datetime) -> datetime:
    """Normalize SQLite's naive test datetimes and PostgreSQL aware values."""

    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def canonical_arguments(
    arguments: dict[str, object],
) -> tuple[dict[str, object], str]:
    """Return stable JSON-compatible arguments and their tamper-check digest."""

    encoded = json.dumps(arguments, sort_keys=True, separators=(",", ":"))
    return json.loads(encoded), hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def approval_identifier(conversation_id: int, run_id: str, tool_call_id: str) -> UUID:
    """Derive an opaque, server-only idempotency key for graph replay."""

    return uuid5(
        APPROVAL_NAMESPACE,
        f"{conversation_id}:{run_id}:{tool_call_id}",
    )


def write_audit_event(
    db: Session,
    *,
    user_id: int,
    event_type: str,
    outcome: str,
    agent_id: int | None = None,
    conversation_id: int | None = None,
    run_id: str | None = None,
    approval_id: UUID | None = None,
    tool_name: str | None = None,
    safe_metadata: dict[str, object] | None = None,
) -> None:
    """Persist identifiers and outcomes only; never prompts, args or content."""

    db.add(
        AgentAuditEvent(
            user_id=user_id,
            agent_id=agent_id,
            conversation_id=conversation_id,
            run_id=run_id,
            approval_id=approval_id,
            tool_name=tool_name,
            event_type=event_type,
            outcome=outcome,
            safe_metadata=safe_metadata or {},
        )
    )


def get_or_create_approval(
    db: Session,
    *,
    user_id: int,
    agent_id: int,
    conversation_id: int,
    run_id: str,
    tool_call_id: str,
    tool_name: str,
    arguments: dict[str, object],
    context_document_ids: tuple[int, ...],
) -> AgentApproval:
    """Store the exact call once, and reject any mismatched LangGraph replay."""

    approval_id = approval_identifier(conversation_id, run_id, tool_call_id)
    normalized, digest = canonical_arguments(arguments)
    approval = db.scalar(
        select(AgentApproval).where(AgentApproval.id == approval_id).with_for_update()
    )
    if approval is None:
        now = datetime.now(UTC)
        approval = AgentApproval(
            id=approval_id,
            user_id=user_id,
            agent_id=agent_id,
            conversation_id=conversation_id,
            run_id=run_id,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            validated_arguments=normalized,
            arguments_sha256=digest,
            context_document_ids=list(context_document_ids),
            status="pending",
            expires_at=now + APPROVAL_TTL,
        )
        db.add(approval)
        write_audit_event(
            db,
            user_id=user_id,
            agent_id=agent_id,
            conversation_id=conversation_id,
            run_id=run_id,
            approval_id=approval_id,
            tool_name=tool_name,
            event_type="approval_requested",
            outcome="pending",
        )
        db.commit()
        db.refresh(approval)
        return approval

    expected = (
        approval.user_id == user_id
        and approval.agent_id == agent_id
        and approval.conversation_id == conversation_id
        and approval.run_id == run_id
        and approval.tool_call_id == tool_call_id
        and approval.tool_name == tool_name
        and approval.arguments_sha256 == digest
        and approval.validated_arguments == normalized
        and approval.context_document_ids == list(context_document_ids)
    )
    if not expected:
        raise ApprovalStateError("The stored approval does not match this tool call.")

    now = datetime.now(UTC)
    if as_utc(approval.expires_at) <= now and approval.status in {
        "pending",
        "approved",
    }:
        approval.status = "expired"
        write_audit_event(
            db,
            user_id=user_id,
            agent_id=agent_id,
            conversation_id=conversation_id,
            run_id=run_id,
            approval_id=approval.id,
            tool_name=tool_name,
            event_type="approval_expired",
            outcome="expired",
        )
        db.commit()
    return approval


def expire_approval(db: Session, approval: AgentApproval) -> None:
    if approval.status in {"pending", "approved"}:
        approval.status = "expired"
        write_audit_event(
            db,
            user_id=approval.user_id,
            agent_id=approval.agent_id,
            conversation_id=approval.conversation_id,
            run_id=approval.run_id,
            approval_id=approval.id,
            tool_name=approval.tool_name,
            event_type="approval_expired",
            outcome="expired",
        )
        db.commit()


def invalidate_approval(db: Session, approval: AgentApproval) -> None:
    """Permanently close an approved action after its resource authorization changes."""

    if approval.status == "approved":
        approval.status = "invalidated"
        write_audit_event(
            db,
            user_id=approval.user_id,
            agent_id=approval.agent_id,
            conversation_id=approval.conversation_id,
            run_id=approval.run_id,
            approval_id=approval.id,
            tool_name=approval.tool_name,
            event_type="approval_invalidated",
            outcome="ownership_changed",
        )
        db.commit()


def get_owned_approval(
    db: Session,
    user: User,
    agent_id: int,
    approval_id: UUID,
    *,
    lock: bool = False,
) -> AgentApproval:
    query = select(AgentApproval).where(
        AgentApproval.id == approval_id,
        AgentApproval.user_id == user.id,
        AgentApproval.agent_id == agent_id,
    )
    if lock:
        query = query.with_for_update()
    approval = db.scalar(query)
    if approval is None:
        raise HTTPException(status_code=404, detail="Approval not found.")
    return approval


def decide_approval(
    db: Session,
    user: User,
    agent_id: int,
    approval_id: UUID,
    *,
    approve: bool,
) -> AgentApproval:
    """Atomically record one owner decision; conflicting/replayed choices fail."""

    approval = get_owned_approval(db, user, agent_id, approval_id, lock=True)
    now = datetime.now(UTC)
    if approval.status != "pending":
        raise HTTPException(status_code=409, detail="Approval is no longer pending.")
    if as_utc(approval.expires_at) <= now:
        approval.status = "expired"
        write_audit_event(
            db,
            user_id=user.id,
            agent_id=agent_id,
            conversation_id=approval.conversation_id,
            run_id=approval.run_id,
            approval_id=approval.id,
            tool_name=approval.tool_name,
            event_type="approval_expired",
            outcome="expired",
        )
        db.commit()
        raise HTTPException(status_code=409, detail="Approval has expired.")

    approval.status = "approved" if approve else "rejected"
    approval.decided_at = now
    write_audit_event(
        db,
        user_id=user.id,
        agent_id=agent_id,
        conversation_id=approval.conversation_id,
        run_id=approval.run_id,
        approval_id=approval.id,
        tool_name=approval.tool_name,
        event_type="approval_decided",
        outcome=approval.status,
    )
    db.commit()
    db.refresh(approval)
    return approval


def claim_approved_execution(
    db: Session,
    approval: AgentApproval,
) -> bool:
    """Claim the one allowed execution before the tool can cause a side effect."""

    now = datetime.now(UTC)
    result = db.execute(
        update(AgentApproval)
        .where(
            AgentApproval.id == approval.id,
            AgentApproval.status == "approved",
            AgentApproval.expires_at > now,
        )
        .values(status="executing")
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.rollback()
        return False
    write_audit_event(
        db,
        user_id=approval.user_id,
        agent_id=approval.agent_id,
        conversation_id=approval.conversation_id,
        run_id=approval.run_id,
        approval_id=approval.id,
        tool_name=approval.tool_name,
        event_type="tool_execution_started",
        outcome="claimed",
    )
    db.commit()
    return True


def finish_approved_execution(
    db: Session,
    approval: AgentApproval,
    *,
    succeeded: bool,
) -> None:
    """Never retry a claimed call when its effect may have partially occurred."""

    now = datetime.now(UTC)
    approval = db.scalar(
        select(AgentApproval)
        .where(AgentApproval.id == approval.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if approval is None or approval.status != "executing":
        raise ApprovalStateError("The approval execution state changed unexpectedly.")
    approval.status = "executed" if succeeded else "execution_uncertain"
    approval.executed_at = now if succeeded else None
    write_audit_event(
        db,
        user_id=approval.user_id,
        agent_id=approval.agent_id,
        conversation_id=approval.conversation_id,
        run_id=approval.run_id,
        approval_id=approval.id,
        tool_name=approval.tool_name,
        event_type="tool_execution_finished",
        outcome=approval.status,
    )
    db.commit()


def list_pending_approvals(
    db: Session,
    user: User,
    agent_id: int,
) -> list[AgentApproval]:
    now = datetime.now(UTC)
    # Expired entries are never actionable even before their status is lazily
    # transitioned by a detail, decision, or replay request.
    return list(
        db.scalars(
            select(AgentApproval)
            .where(
                AgentApproval.user_id == user.id,
                AgentApproval.agent_id == agent_id,
                AgentApproval.status == "pending",
                AgentApproval.expires_at > now,
            )
            .order_by(AgentApproval.created_at.desc())
        ).all()
    )


def public_action_summary(db: Session, approval: AgentApproval) -> str:
    """Return the minimum user-facing context required to make a decision."""

    if approval.tool_name == "delete_document":
        document_id = approval.validated_arguments.get("document_id")
        filename = db.scalar(
            select(Document.filename).where(
                Document.id == document_id,
                Document.user_id == approval.user_id,
            )
        )
        if filename:
            safe_name = filter_sensitive_output(
                "".join(char for char in filename if ord(char) >= 32)
            ).replace("\n", " ")
            return f"Permanently delete '{safe_name}' (document {document_id})."
        return f"Permanently delete document {document_id}."
    return f"Approve one invocation of the {approval.tool_name} tool."

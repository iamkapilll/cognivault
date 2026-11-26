"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";

import type { AgentConfiguration } from "@/types/agents";

type Props = {
  agent: AgentConfiguration | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (agent: AgentConfiguration) => void;
};

export default function AgentDeleteDialog({
  agent,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (agent && !dialog.open) dialog.showModal();
    if (!agent && dialog.open) dialog.close();
  }, [agent]);

  if (!agent) return null;

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-agent-title"
      aria-describedby="delete-agent-description"
      onClose={onClose}
      className="w-[min(92vw,460px)] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-strong">
            <AlertTriangle size={18} />
          </span>
          <div>
            <h2 id="delete-agent-title" className="text-base font-semibold">
              Delete {agent.name}?
            </h2>
            <p id="delete-agent-description" className="mt-2 text-sm leading-6 text-muted-strong">
              This permanently removes the agent and may also delete its conversations, approval records, and checkpoint history. This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => dialogRef.current?.close()}
            className="button-secondary focus-ring inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium disabled:opacity-50"
          >
            Keep agent
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(agent)}
            className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-3 px-4 text-sm font-medium text-foreground transition hover:bg-background disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {busy ? "Deleting…" : "Delete agent"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

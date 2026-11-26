import Link from "next/link";
import {
  ArrowUpRight,
  BrainCircuit,
  CircleCheck,
  CirclePause,
  Cpu,
  LockKeyhole,
  Pencil,
  Power,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";

import type {
  AgentConfiguration,
  AgentConfigurationMetadata,
} from "@/types/agents";

type Props = {
  agent: AgentConfiguration;
  metadata: AgentConfigurationMetadata;
  busy: boolean;
  onToggle: (agent: AgentConfiguration) => void;
  onDelete: (agent: AgentConfiguration) => void;
};

export default function AgentCard({
  agent,
  metadata,
  busy,
  onToggle,
  onDelete,
}: Props) {
  const provider = metadata.providers.find(
    (item) => item.provider === agent.model_provider,
  );
  const toolLabels = agent.enabled_tools.map(
    (name) => metadata.tools.find((tool) => tool.name === name)?.display_name ?? name,
  );

  return (
    <article className="surface-card group flex min-h-[256px] flex-col rounded-2xl p-5 transition duration-200 hover:-translate-y-0.5 hover:border-border-strong sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/agents/${agent.id}`} className="focus-ring flex min-w-0 items-center gap-3 rounded-xl">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-strong transition group-hover:text-foreground">
            <Cpu size={19} strokeWidth={1.7} />
          </span>
          <span className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
              <span className="truncate">{agent.name}</span>
              <ArrowUpRight size={13} className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
            </h2>
            <span className="mt-1 block truncate text-[11px] text-muted-strong">
              {provider?.display_name ?? agent.model_provider} · {agent.model_name}
            </span>
          </span>
        </Link>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${agent.is_active ? "border-border-strong text-foreground" : "border-border text-muted"}`}>
          {agent.is_active ? <CircleCheck size={12} /> : <CirclePause size={12} />}
          {agent.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 min-h-10 text-xs leading-5 text-muted-strong">
        {agent.description || "No description added."}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {toolLabels.length ? (
          <>
            {toolLabels.slice(0, 3).map((label, index) => (
              <span key={`${agent.enabled_tools[index]}-${label}`} className="rounded-md border border-border bg-background px-2 py-1 text-[10px] text-muted-strong">
                {label}
              </span>
            ))}
            {toolLabels.length > 3 && (
              <span className="rounded-md border border-border bg-background px-2 py-1 text-[10px] text-muted-strong">
                +{toolLabels.length - 3}
              </span>
            )}
          </>
        ) : (
          <span className="rounded-md border border-border bg-background px-2 py-1 text-[10px] text-muted">
            No tools enabled
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-strong">
          <Wrench size={13} />
          {agent.enabled_tools.length} {agent.enabled_tools.length === 1 ? "tool" : "tools"}
        </span>
        <span className={`inline-flex items-center gap-1.5 text-[10px] ${agent.memory_enabled ? "text-muted-strong" : "text-muted"}`}>
          <BrainCircuit size={13} /> Memory {agent.memory_enabled ? "on" : "off"}
        </span>
        <span className={`inline-flex items-center gap-1.5 text-[10px] ${agent.human_approval_required ? "text-muted-strong" : "text-muted"}`}>
          {agent.human_approval_required ? <ShieldCheck size={13} /> : <LockKeyhole size={13} />}
          {agent.human_approval_required ? "Approval on" : "Risk checks on"}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-end gap-1">
        <button
          type="button"
          aria-label={`${agent.is_active ? "Deactivate" : "Activate"} ${agent.name}`}
          title={agent.is_active ? "Deactivate" : "Activate"}
          disabled={busy}
          onClick={() => onToggle(agent)}
          className="icon-button focus-ring h-8 w-8 rounded-lg disabled:opacity-40"
        >
          <Power size={14} />
        </button>
        <Link
          href={`/agents/${agent.id}/edit`}
          aria-label={`Edit ${agent.name}`}
          title="Edit agent"
          className="icon-button focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg"
        >
          <Pencil size={14} />
        </Link>
        <button
          type="button"
          aria-label={`Delete ${agent.name}`}
          title="Delete agent"
          onClick={() => onDelete(agent)}
          className="icon-button focus-ring h-8 w-8 rounded-lg"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

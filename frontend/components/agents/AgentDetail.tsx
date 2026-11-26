"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  CircleCheck,
  CirclePause,
  Cpu,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";

import AgentDeleteDialog from "@/components/agents/AgentDeleteDialog";
import { useToast } from "@/components/Toast";
import {
  deleteAgent,
  getAgent,
  getAgentConfigurationMetadata,
  updateAgent,
} from "@/lib/api/agents";
import type {
  AgentConfiguration,
  AgentConfigurationMetadata,
} from "@/types/agents";

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export default function AgentDetail({ agentId }: { agentId: number | null }) {
  const router = useRouter();
  const { push } = useToast();
  const [agent, setAgent] = useState<AgentConfiguration | null>(null);
  const [metadata, setMetadata] = useState<AgentConfigurationMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function refresh() {
    if (!agentId) {
      setError("That agent address is not valid.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [savedAgent, configuration] = await Promise.all([
        getAgent(agentId),
        getAgentConfigurationMetadata(),
      ]);
      setAgent(savedAgent);
      setMetadata(configuration);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Agent details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Agent data is an authenticated API resource and is refreshed on route id changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // The route id is the only load trigger; refresh is also bound to a button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function toggleActive() {
    if (!agent) return;
    setBusy(true);
    try {
      const updated = await updateAgent(agent.id, { is_active: !agent.is_active });
      setAgent(updated);
      push(`${updated.name} ${updated.is_active ? "activated" : "deactivated"}`, "success");
    } catch (toggleError) {
      push(toggleError instanceof Error ? toggleError.message : "Could not update agent", "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(target: AgentConfiguration) {
    setBusy(true);
    try {
      await deleteAgent(target.id);
      push("Agent and its saved conversations were deleted", "success");
      router.replace("/agents");
    } catch (deleteError) {
      push(deleteError instanceof Error ? deleteError.message : "Could not delete agent", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10" aria-label="Loading agent details" aria-busy="true">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="surface-card mt-6 h-56 animate-pulse rounded-2xl" />
        <div className="mt-5 grid gap-5 lg:grid-cols-2"><div className="surface-card h-56 animate-pulse rounded-2xl" /><div className="surface-card h-56 animate-pulse rounded-2xl" /></div>
      </div>
    );
  }

  if (error || !agent || !metadata) {
    const missing = error.toLowerCase().includes("not found");
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div role="alert" className="surface-card rounded-2xl p-6">
          <AlertCircle size={18} className="text-muted-strong" />
          <h1 className="mt-3 text-base font-semibold text-foreground">{missing ? "Agent not found" : "Could not load agent"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-strong">{error || "This agent is unavailable."}</p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => void refresh()} className="button-secondary focus-ring inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs"><RefreshCw size={13} /> Try again</button>
            <Link href="/agents" className="button-secondary focus-ring rounded-lg px-3 py-2 text-xs">All agents</Link>
          </div>
        </div>
      </div>
    );
  }

  const provider = metadata.providers.find((item) => item.provider === agent.model_provider);
  const tools = agent.enabled_tools.map((name) => metadata.tools.find((tool) => tool.name === name)).filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/agents" className="focus-ring inline-flex items-center gap-2 rounded-lg py-1 text-xs text-muted-strong hover:text-foreground"><ArrowLeft size={14} /> All agents</Link>
      <section className="surface-card mt-5 rounded-2xl p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-strong"><Cpu size={21} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{agent.name}</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-2 py-1 text-[10px] text-muted-strong">
                  {agent.is_active ? <CircleCheck size={12} /> : <CirclePause size={12} />}
                  {agent.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-strong">{agent.description || "No description added."}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5"><Cpu size={13} /> {provider?.display_name ?? agent.model_provider} · {agent.model_name}</span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> Updated {dateLabel(agent.updated_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void toggleActive()} disabled={busy} className="button-secondary focus-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium disabled:opacity-50"><Power size={13} /> {agent.is_active ? "Deactivate" : "Activate"}</button>
            <Link href={`/agents/${agent.id}/edit`} className="button-secondary focus-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium"><Pencil size={13} /> Edit</Link>
            <button type="button" onClick={() => setDeleteOpen(true)} className="button-secondary focus-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium"><Trash2 size={13} /> Delete</button>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="surface-card rounded-2xl p-5 sm:p-6" aria-labelledby="detail-model-title">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-strong"><Cpu size={16} /></span><div><h2 id="detail-model-title" className="text-sm font-semibold text-foreground">Model</h2><p className="mt-1 text-xs text-muted-strong">Provider and generation settings.</p></div></div>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Provider</dt><dd className="mt-1.5 text-xs font-medium text-foreground">{provider?.display_name ?? agent.model_provider}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Model</dt><dd className="mt-1.5 break-all text-xs font-medium text-foreground">{agent.model_name}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Temperature</dt><dd className="mt-1.5 font-mono text-xs text-foreground">{agent.temperature.toFixed(2)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Persistent memory</dt><dd className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-strong"><BrainCircuit size={13} /> {agent.memory_enabled ? "Enabled" : "Disabled"}</dd></div>
          </dl>
        </section>

        <section className="surface-card rounded-2xl p-5 sm:p-6" aria-labelledby="detail-tools-title">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-strong"><Wrench size={16} /></span><div><h2 id="detail-tools-title" className="text-sm font-semibold text-foreground">Tools and safeguards</h2><p className="mt-1 text-xs text-muted-strong">{tools.length} {tools.length === 1 ? "tool" : "tools"} enabled for this agent.</p></div></div>
          <div className="mt-5 space-y-2">
            {tools.length ? tools.map((tool) => tool && (
              <div key={tool.name} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
                <span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{tool.display_name}</span><span className="mt-1 block text-[10px] text-muted">{tool.risk_level} risk · {tool.category.replaceAll("_", " ")}</span></span>
                {tool.requires_human_approval ? <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-strong"><ShieldCheck size={12} /> Approval required</span> : <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted"><LockKeyhole size={12} /> Risk checked</span>}
              </div>
            )) : <p className="rounded-xl border border-border bg-background px-3 py-4 text-xs text-muted-strong">No tools enabled. This agent answers with its selected model only.</p>}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-strong"><ShieldCheck size={13} /> {agent.human_approval_required ? "Approval is required before every tool call." : "Mandatory approval remains on for sensitive actions."}</p>
          </div>
        </section>

        <section className="surface-card rounded-2xl p-5 sm:p-6 lg:col-span-2" aria-labelledby="detail-prompt-title">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-strong"><FileText size={16} /></span><div><h2 id="detail-prompt-title" className="text-sm font-semibold text-foreground">System instructions</h2><p className="mt-1 text-xs text-muted-strong">The saved role and response guidance.</p></div></div>
          <pre className="mt-5 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-4 font-mono text-xs leading-6 text-muted-strong">{agent.system_prompt}</pre>
        </section>
      </div>

      <AgentDeleteDialog agent={deleteOpen ? agent : null} busy={busy} onClose={() => setDeleteOpen(false)} onConfirm={(target) => void confirmDelete(target)} />
      {busy && <span className="sr-only" role="status"><LoaderCircle className="animate-spin" /> Updating agent</span>}
    </div>
  );
}

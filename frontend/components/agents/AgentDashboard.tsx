"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bot,
  BrainCircuit,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import AgentDeleteDialog from "@/components/agents/AgentDeleteDialog";
import AgentGrid from "@/components/agents/AgentGrid";
import { useToast } from "@/components/Toast";
import {
  deleteAgent,
  getAgentConfigurationMetadata,
  listAgents,
  updateAgent,
} from "@/lib/api/agents";
import type {
  AgentConfiguration,
  AgentConfigurationMetadata,
} from "@/types/agents";

type StatusFilter = "all" | "active" | "inactive";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Agents could not be loaded.";
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bot;
  label: string;
  value: number;
}) {
  return (
    <div className="surface-card flex items-center gap-3 rounded-xl px-4 py-3.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-strong">
        <Icon size={16} />
      </span>
      <span>
        <span className="block text-lg font-semibold leading-5 text-foreground">{value}</span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.1em] text-muted">{label}</span>
      </span>
    </div>
  );
}

export default function AgentDashboard() {
  const { push } = useToast();
  const [agents, setAgents] = useState<AgentConfiguration[]>([]);
  const [metadata, setMetadata] = useState<AgentConfigurationMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [busyAgentId, setBusyAgentId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentConfiguration | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [items, configuration] = await Promise.all([
        listAgents(),
        getAgentConfigurationMetadata(),
      ]);
      setAgents(items);
      setMetadata(configuration);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load the authenticated collection once after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const filteredAgents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return agents.filter((agent) => {
      const matchesQuery =
        !normalized ||
        agent.name.toLocaleLowerCase().includes(normalized) ||
        (agent.description ?? "").toLocaleLowerCase().includes(normalized);
      const matchesProvider = provider === "all" || agent.model_provider === provider;
      const matchesStatus =
        status === "all" || (status === "active" ? agent.is_active : !agent.is_active);
      return matchesQuery && matchesProvider && matchesStatus;
    });
  }, [agents, provider, query, status]);

  async function toggleAgent(agent: AgentConfiguration) {
    setBusyAgentId(agent.id);
    try {
      const updated = await updateAgent(agent.id, { is_active: !agent.is_active });
      setAgents((current) => current.map((item) => item.id === updated.id ? updated : item));
      push(`${updated.name} ${updated.is_active ? "activated" : "deactivated"}`, "success");
    } catch (toggleError) {
      push(errorText(toggleError), "error");
    } finally {
      setBusyAgentId(null);
    }
  }

  async function confirmDelete(agent: AgentConfiguration) {
    setBusyAgentId(agent.id);
    try {
      await deleteAgent(agent.id);
      setAgents((current) => current.filter((item) => item.id !== agent.id));
      setDeleteTarget(null);
      push("Agent and its saved conversations were deleted", "success");
    } catch (deleteError) {
      push(errorText(deleteError), "error");
    } finally {
      setBusyAgentId(null);
    }
  }

  const activeCount = agents.filter((agent) => agent.is_active).length;
  const memoryCount = agents.filter((agent) => agent.memory_enabled).length;
  const approvalCount = agents.filter((agent) => agent.human_approval_required).length;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:pb-7">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            <Sparkles size={13} /> Personal workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
            My agents
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-strong">
            Build focused AI teammates with the models, tools, and safeguards you choose.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh agents"
            className="button-secondary focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link href="/agents/new" className="button-primary focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold">
            <Plus size={15} /> Create agent
          </Link>
        </div>
      </header>

      <section aria-label="Agent overview" className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat icon={Bot} label="Total agents" value={agents.length} />
        <Stat icon={BrainCircuit} label="Active agents" value={activeCount} />
        <Stat icon={ShieldCheck} label="Memory enabled" value={memoryCount} />
      </section>

      <div className="mt-8 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            aria-label="Search agents"
            placeholder="Search by name or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="control-input h-10 w-full rounded-xl pl-10 pr-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <label className="sr-only" htmlFor="agent-provider-filter">Filter by provider</label>
          <select id="agent-provider-filter" aria-label="Filter by provider" value={provider} onChange={(event) => setProvider(event.target.value)} className="control-input h-10 min-w-0 rounded-xl px-3 text-xs sm:min-w-36">
            <option value="all">All providers</option>
            {metadata?.providers.map((item) => <option key={item.provider} value={item.provider}>{item.display_name}</option>)}
          </select>
          <label className="sr-only" htmlFor="agent-status-filter">Filter by status</label>
          <select id="agent-status-filter" aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="control-input h-10 min-w-0 rounded-xl px-3 text-xs sm:min-w-32">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-strong">
          {loading ? "Loading your agents…" : `${filteredAgents.length} ${filteredAgents.length === 1 ? "agent" : "agents"}`}
        </p>
        {metadata && (
          <p className="hidden text-[10px] text-muted sm:block">
            {metadata.providers.filter((item) => item.available).length} model providers ready
          </p>
        )}
      </div>

      {error ? (
        <div role="alert" className="mt-5 rounded-2xl border border-border bg-surface p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 text-muted-strong" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">We couldn’t load your agents</h2>
              <p className="mt-1 text-xs leading-5 text-muted-strong">{error}</p>
              <button type="button" onClick={() => void refresh()} className="button-secondary focus-ring mt-4 rounded-lg px-3 py-2 text-xs font-medium">Try again</button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Loading agents" aria-busy="true">
          {[0, 1, 2].map((item) => <div key={item} className="surface-card h-[256px] animate-pulse rounded-2xl p-5"><div className="skeleton h-11 w-11 rounded-xl" /><div className="skeleton mt-5 h-4 w-2/3 rounded" /><div className="skeleton mt-3 h-3 w-full rounded" /><div className="skeleton mt-2 h-3 w-4/5 rounded" /></div>)}
        </div>
      ) : agents.length === 0 ? (
        <div className="surface-card mt-5 flex min-h-[300px] flex-col items-center justify-center rounded-2xl px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-muted-strong"><Bot size={22} /></span>
          <h2 className="mt-4 text-base font-semibold text-foreground">Start with your first agent</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-strong">Shape a focused assistant around your instructions, trusted tools, and preferred model.</p>
          <Link href="/agents/new" className="button-primary focus-ring mt-5 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-semibold"><Plus size={14} /> Create your first agent</Link>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="surface-card mt-5 flex min-h-48 flex-col items-center justify-center rounded-2xl px-6 py-10 text-center">
          <Search size={20} className="text-muted" />
          <h2 className="mt-3 text-sm font-semibold text-foreground">No matching agents</h2>
          <p className="mt-1 text-xs text-muted-strong">Adjust your search or filters and try again.</p>
          <button type="button" onClick={() => { setQuery(""); setProvider("all"); setStatus("all"); }} className="focus-ring mt-3 rounded-lg px-3 py-2 text-xs text-muted-strong hover:text-foreground">Clear filters</button>
        </div>
      ) : metadata ? (
        <div className="mt-5">
          <AgentGrid agents={filteredAgents} metadata={metadata} busyAgentId={busyAgentId} onToggle={(agent) => void toggleAgent(agent)} onDelete={setDeleteTarget} />
        </div>
      ) : null}

      {agents.length > 0 && approvalCount > 0 && (
        <p className="mt-5 text-[10px] leading-5 text-muted">
          {approvalCount} {approvalCount === 1 ? "agent uses" : "agents use"} approval before every tool action. Sensitive operations keep their server-enforced approval checks regardless of this preference.
        </p>
      )}

      <AgentDeleteDialog
        agent={deleteTarget}
        busy={busyAgentId === deleteTarget?.id}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(agent) => void confirmDelete(agent)}
      />
    </div>
  );
}

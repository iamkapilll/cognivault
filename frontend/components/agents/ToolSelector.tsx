import { AlertTriangle, Check, LockKeyhole, Wrench } from "lucide-react";

import type { AgentToolMetadata } from "@/types/agents";

type Props = {
  tools: AgentToolMetadata[];
  selected: string[];
  supportsToolCalling: boolean;
  onChange: (tools: string[]) => void;
};

const UNAVAILABLE_COPY: Record<AgentToolMetadata["availability_status"], string> = {
  available: "Available",
  missing_configuration: "Server configuration required",
  approval_unavailable: "Approval runtime unavailable",
  disabled: "Unavailable for custom agents",
};

export default function ToolSelector({
  tools,
  selected,
  supportsToolCalling,
  onChange,
}: Props) {
  function toggle(name: string, enabled: boolean) {
    onChange(enabled ? [...selected, name] : selected.filter((item) => item !== name));
  }

  return (
    <section className="surface-card rounded-2xl p-5 sm:p-6" aria-labelledby="tools-title">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-strong">
          <Wrench size={17} />
        </span>
        <div>
          <h2 id="tools-title" className="text-sm font-semibold text-foreground">
            Tools and capabilities
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-strong">
            Each tool is validated and authorized by the server at runtime.
          </p>
        </div>
      </div>

      {!supportsToolCalling && (
        <p role="status" className="mt-4 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-strong">
          The selected model does not support tool calling. Remove selected tools or choose a compatible model.
        </p>
      )}

      <div className="mt-4 divide-y divide-border">
        {tools.map((tool) => {
          const checked = selected.includes(tool.name);
          const canEnable = tool.available && supportsToolCalling;
          const unavailableMessage = UNAVAILABLE_COPY[tool.availability_status];
          return (
            <label
              key={tool.name}
              className={`flex cursor-pointer items-start gap-3 py-4 first:pt-0 last:pb-0 ${
                !canEnable && !checked ? "cursor-not-allowed opacity-55" : ""
              }`}
            >
              <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border border-border-strong bg-background">
                <input
                  type="checkbox"
                  aria-label={`Enable ${tool.display_name}`}
                  checked={checked}
                  disabled={!canEnable && !checked}
                  onChange={(event) => toggle(tool.name, event.target.checked)}
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                {checked && <Check aria-hidden="true" size={12} className="pointer-events-none text-foreground" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{tool.display_name}</span>
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-muted">
                    {tool.risk_level}
                  </span>
                  {tool.requires_human_approval && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[9px] text-muted-strong">
                      <LockKeyhole size={10} /> Approval required
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[11px] leading-5 text-muted-strong">
                  {tool.description}
                </span>
                {!tool.available && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted">
                    <AlertTriangle size={11} /> {unavailableMessage}
                  </span>
                )}
                {tool.requires_memory && tool.available && (
                  <span className="mt-1.5 block text-[10px] text-muted">
                    Persistent memory is required so approvals can resume safely.
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

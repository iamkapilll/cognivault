import { BrainCircuit } from "lucide-react";

type Props = {
  enabled: boolean;
  required: boolean;
  onChange: (enabled: boolean) => void;
};

export default function MemorySettings({ enabled, required, onChange }: Props) {
  return (
    <section className="surface-card rounded-2xl p-5 sm:p-6" aria-labelledby="memory-title">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-strong">
          <BrainCircuit size={17} />
        </span>
        <div>
          <h2 id="memory-title" className="text-sm font-semibold text-foreground">
            Persistent memory
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-strong">
            Keep conversation history across turns for this agent.
          </p>
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-background p-3.5">
        <span>
          <span className="block text-xs font-medium text-foreground">Remember conversations</span>
          <span className="mt-1 block text-[11px] leading-5 text-muted-strong">
            History is stored securely with the agent conversation.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Enable persistent memory"
          checked={enabled}
          disabled={required}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 shrink-0 accent-[var(--foreground)] disabled:cursor-not-allowed"
        />
      </label>
      {required && (
        <p role="status" className="mt-2 text-[11px] leading-5 text-muted-strong">
          Memory stays on because this configuration uses approvals. The backend requires a durable conversation checkpoint to resume safely.
        </p>
      )}
    </section>
  );
}

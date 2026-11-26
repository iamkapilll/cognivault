import { ShieldCheck } from "lucide-react";

type Props = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export default function ApprovalSettings({ enabled, onChange }: Props) {
  return (
    <section className="surface-card rounded-2xl p-5 sm:p-6" aria-labelledby="approval-title">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-strong">
          <ShieldCheck size={17} />
        </span>
        <div>
          <h2 id="approval-title" className="text-sm font-semibold text-foreground">
            Human approval
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-strong">
            Pause before every tool action and wait for your decision.
          </p>
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-background p-3.5">
        <span>
          <span className="block text-xs font-medium text-foreground">Require approval for all tools</span>
          <span className="mt-1 block text-[11px] leading-5 text-muted-strong">
            Higher-risk and destructive actions always require approval, even when this is off.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Require approval for all tools"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 shrink-0 accent-[var(--foreground)]"
        />
      </label>
      {enabled && (
        <p className="mt-2 text-[11px] leading-5 text-muted-strong">
          Persistent memory is enabled automatically because this agent needs a saved checkpoint while it waits.
        </p>
      )}
    </section>
  );
}

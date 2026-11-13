import { ArrowRight } from "lucide-react";

type AuthSubmitButtonProps = {
  loading: boolean;
  idleLabel: string;
  loadingLabel: string;
};

export default function AuthSubmitButton({
  loading,
  idleLabel,
  loadingLabel,
}: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="auth-submit focus-ring group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[12px] font-semibold tracking-[0.01em] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0"
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
          />
          {loadingLabel}
        </>
      ) : (
        <>
          {idleLabel}
          <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  );
}

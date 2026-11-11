import { ArrowRightIcon } from "@/components/icons";

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
      className="focus-ring group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-indigo-300/25 bg-[linear-gradient(180deg,#6366f1,#4f46e5)] text-sm font-medium text-white shadow-[0_14px_34px_-16px_rgba(79,70,229,0.85),inset_0_1px_0_rgba(255,255,255,0.2)] transition duration-150 hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100 disabled:active:translate-y-0"
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
          <ArrowRightIcon
            width={16}
            height={16}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </>
      )}
    </button>
  );
}

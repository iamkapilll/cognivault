import { AlertCircleIcon } from "@/components/icons";

type AuthAlertProps = {
  id: string;
  message: string;
};

export default function AuthAlert({ id, message }: AuthAlertProps) {
  return (
    <div
      id={id}
      role="alert"
      className="auth-rise flex items-start gap-2.5 rounded-xl border border-red-400/25 bg-red-500/[0.07] px-3.5 py-3 text-[12.5px] leading-5 text-red-200"
    >
      <AlertCircleIcon width={15} height={15} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

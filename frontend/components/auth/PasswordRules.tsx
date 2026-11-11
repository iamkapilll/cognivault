import { CheckIcon } from "@/components/icons";

const RULES = [
  { label: "At least 12 characters", test: (value: string) => value.length >= 12 },
  { label: "At least one letter", test: (value: string) => /[A-Za-z]/.test(value) },
  { label: "At least one number", test: (value: string) => /\d/.test(value) },
];

type PasswordRulesProps = {
  id: string;
  password: string;
};

export default function PasswordRules({ id, password }: PasswordRulesProps) {
  return (
    <ul id={id} className="mt-2.5 grid gap-1.5">
      {RULES.map((rule) => {
        const passed = rule.test(password);

        return (
          <li
            key={rule.label}
            className={`flex items-center gap-2 text-[11.5px] transition-colors duration-200 ${
              passed ? "text-emerald-300/90" : "text-[#667088]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                passed
                  ? "border-emerald-400/40 bg-emerald-400/10"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {passed ? (
                <CheckIcon width={10} height={10} />
              ) : (
                <span className="h-1 w-1 rounded-full bg-current opacity-60" />
              )}
            </span>
            {rule.label}
            <span className="sr-only">
              {passed ? "(requirement met)" : "(not met yet)"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

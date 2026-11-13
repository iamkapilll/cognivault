"use client";

import { useState } from "react";
import { AtSign, Eye, EyeOff, LockKeyhole } from "lucide-react";

type AuthFieldProps = {
  id: string;
  name: string;
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  disabled?: boolean;
  describedBy?: string;
  inputMode?: "email" | "text";
  invalid?: boolean;
};

export default function AuthField({
  id,
  name,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled = false,
  describedBy,
  inputMode,
  invalid = false,
}: AuthFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;
  const LeadingIcon = type === "email" ? AtSign : isPassword ? LockKeyhole : null;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2.5 block text-[11px] font-semibold tracking-[0.01em] text-foreground"
      >
        {label}
      </label>

      <div className="relative">
        {LeadingIcon && (
          <LeadingIcon
            size={16}
            strokeWidth={1.7}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
        )}
        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
          disabled={disabled}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          spellCheck={false}
          autoCapitalize="none"
          className={`h-12 w-full rounded-xl border border-border bg-sidebar pl-10 pr-3.5 text-[13px] text-foreground outline-none transition duration-200 placeholder:text-muted hover:border-border-strong focus:border-muted-strong focus:ring-4 focus:ring-foreground/15 aria-invalid:border-error/45 aria-invalid:focus:border-error/60 aria-invalid:focus:ring-error/[0.12] disabled:cursor-not-allowed disabled:opacity-60 ${
            isPassword ? "pr-12" : ""
          }`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            aria-controls={id}
            disabled={disabled}
            className="focus-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
    </div>
  );
}

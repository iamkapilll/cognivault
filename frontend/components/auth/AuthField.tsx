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
        className="mb-2.5 block text-[11px] font-semibold tracking-[0.01em] text-[#d0ceda]"
      >
        {label}
      </label>

      <div className="relative">
        {LeadingIcon && (
          <LeadingIcon
            size={16}
            strokeWidth={1.7}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#727383]"
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
          className={`h-12 w-full rounded-xl border border-white/[0.09] bg-[#0a0b11]/90 pl-10 pr-3.5 text-[13px] text-[#f0eef7] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition duration-200 placeholder:text-[#666775] hover:border-white/[0.16] focus:border-[#9d8cff]/65 focus:bg-[#101017] focus:ring-4 focus:ring-[#8c7cff]/[0.12] aria-invalid:border-red-400/45 aria-invalid:focus:border-red-400/60 aria-invalid:focus:ring-red-500/[0.12] disabled:cursor-not-allowed disabled:opacity-60 ${
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
            className="focus-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-[#787986] transition-colors duration-150 hover:text-[#d7d3e4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
    </div>
  );
}

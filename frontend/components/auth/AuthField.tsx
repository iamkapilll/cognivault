"use client";

import { useState } from "react";

import { EyeIcon, EyeOffIcon } from "@/components/icons";

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

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-[13px] font-medium text-[#c2c7d4]"
      >
        {label}
      </label>

      <div className="relative">
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
          className={`h-11 w-full rounded-xl border border-white/[0.08] bg-[#0a0d15] px-3.5 text-sm text-[#eef0f7] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition duration-150 placeholder:text-[#525a6d] hover:border-white/[0.15] focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/[0.12] aria-invalid:border-red-400/45 aria-invalid:focus:border-red-400/60 aria-invalid:focus:ring-red-500/[0.12] disabled:cursor-not-allowed disabled:opacity-60 ${
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
            className="focus-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-[#6f788c] transition-colors duration-150 hover:text-[#c7cbd6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revealed ? (
              <EyeOffIcon width={17} height={17} />
            ) : (
              <EyeIcon width={17} height={17} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

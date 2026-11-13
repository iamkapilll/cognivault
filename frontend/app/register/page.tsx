"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { registerUser } from "@/lib/auth-api";
import AuthAlert from "@/components/auth/AuthAlert";
import AuthField from "@/components/auth/AuthField";
import AuthLayout from "@/components/auth/AuthLayout";
import AuthSubmitButton from "@/components/auth/AuthSubmitButton";
import PasswordRules from "@/components/auth/PasswordRules";
import { ShieldCheckIcon } from "@/components/icons";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }

    try {
      setLoading(true);
      await registerUser(email.trim(), password);

      router.replace("/agent");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      heading="Create your workspace"
      subheading="Your documents and conversations stay private to your account."
      footer={
        <>
          <p className="text-center text-[13px] text-muted-strong">
            Already have an account?{" "}
            <Link
              href="/login"
              className="focus-ring rounded font-medium text-foreground underline-offset-4 transition-colors hover:text-muted-strong hover:underline"
            >
              Sign in
            </Link>
          </p>
          <p className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-muted">
            <ShieldCheckIcon width={13} height={13} className="shrink-0" />
            Argon2 hashing · HttpOnly session cookies
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthField
          id="register-email"
          name="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          disabled={loading}
          inputMode="email"
          describedBy={error ? "register-error" : undefined}
          invalid={Boolean(error)}
        />

        <div>
          <AuthField
            id="register-password"
            name="new-password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="Choose a strong password"
            disabled={loading}
            describedBy={
              error ? "register-rules register-error" : "register-rules"
            }
            invalid={Boolean(error)}
          />
          <PasswordRules id="register-rules" password={password} />
        </div>

        <AuthField
          id="register-confirm"
          name="confirm-password"
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="Repeat your password"
          disabled={loading}
          describedBy={error ? "register-error" : undefined}
          invalid={Boolean(error)}
        />

        {error && <AuthAlert id="register-error" message={error} />}

        <AuthSubmitButton
          loading={loading}
          idleLabel="Create account"
          loadingLabel="Creating account…"
        />
      </form>
    </AuthLayout>
  );
}

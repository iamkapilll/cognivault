"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { loginUser } from "@/lib/auth-api";
import AuthAlert from "@/components/auth/AuthAlert";
import AuthField from "@/components/auth/AuthField";
import AuthLayout from "@/components/auth/AuthLayout";
import AuthSubmitButton from "@/components/auth/AuthSubmitButton";
import { ShieldCheckIcon } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    try {
      setLoading(true);
      await loginUser(email.trim(), password);

      router.replace("/agent");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      heading="Welcome back"
      subheading="Sign in to your workspace and pick up where you left off."
      footer={
        <>
          <p className="text-center text-[13px] text-[#8b93a7]">
            New to Cognivault?{" "}
            <Link
              href="/register"
              className="focus-ring rounded font-medium text-indigo-300 underline-offset-4 transition-colors hover:text-indigo-200 hover:underline"
            >
              Create an account
            </Link>
          </p>
          <p className="mt-5 flex items-center justify-center gap-2 text-[11px] text-[#5d6577]">
            <ShieldCheckIcon width={13} height={13} />
            Argon2 hashing · HttpOnly session cookies
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthField
          id="login-email"
          name="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          disabled={loading}
          inputMode="email"
          describedBy={error ? "login-error" : undefined}
          invalid={Boolean(error)}
        />

        <AuthField
          id="login-password"
          name="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Enter your password"
          disabled={loading}
          describedBy={error ? "login-error" : undefined}
          invalid={Boolean(error)}
        />

        {error && <AuthAlert id="login-error" message={error} />}

        <AuthSubmitButton
          loading={loading}
          idleLabel="Sign in"
          loadingLabel="Signing in…"
        />
      </form>
    </AuthLayout>
  );
}

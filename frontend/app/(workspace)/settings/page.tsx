"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthGuard";
import { useToast } from "@/components/Toast";
import { logoutAllSessions, logoutUser } from "@/lib/auth-api";
import { getHealth } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { push } = useToast();

  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getHealth()
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));
  }, []);

  async function revokeAll() {
    try {
      setBusy(true);
      await logoutAllSessions();
      router.replace("/login");
    } catch (error) {
      push(error instanceof Error ? error.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await logoutUser();
      router.replace("/login");
    } catch (error) {
      push(error instanceof Error ? error.message : "Logout failed", "error");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8 md:py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-strong">
          Account
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Settings
        </h1>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="surface-card rounded-2xl p-5">
          <h2 className="text-sm font-medium">Profile</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                Email
              </dt>
              <dd className="mt-1 break-all">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                User ID
              </dt>
              <dd className="mt-1">#{user?.id}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                Member since
              </dt>
              <dd className="mt-1">
                {user ? new Date(user.created_at).toLocaleDateString() : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="surface-card rounded-2xl p-5">
          <h2 className="text-sm font-medium">System</h2>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-strong">Backend API</span>
              <span
                className={`flex items-center gap-2 text-xs ${
                  health === "ok"
                    ? "text-success"
                    : health === "down"
                      ? "text-error"
                      : "text-muted-strong"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    health === "ok"
                      ? "bg-success"
                      : health === "down"
                        ? "bg-error"
                        : "bg-muted"
                  }`}
                />
                {health === "ok"
                  ? "Operational"
                  : health === "down"
                    ? "Unreachable"
                    : "Checking…"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-strong">Session storage</span>
              <span className="text-xs text-muted-strong">
                HttpOnly cookie
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-strong">CSRF protection</span>
              <span className="text-xs text-muted-strong">
                Origin-checked writes
              </span>
            </div>
          </div>
        </section>

        <section className="surface-card rounded-2xl p-5 md:col-span-2">
          <h2 className="text-sm font-medium">Sessions</h2>
          <p className="mt-1 text-xs leading-6 text-muted-strong">
            Signing out revokes the current session on the server. Revoking all
            sessions invalidates every device that uses this account.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void logout()}
              className="focus-ring rounded-lg border border-border-strong px-4 py-2 text-sm text-muted-strong hover:border-accent hover:text-white"
            >
              Sign out
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void revokeAll()}
              className="focus-ring rounded-lg border border-border-strong bg-surface-2 px-4 py-2 text-sm text-foreground transition hover:bg-surface-3 disabled:opacity-50"
            >
              {busy ? "Revoking…" : "Revoke all sessions"}
            </button>
          </div>
        </section>

        <section className="surface-card rounded-2xl p-5 md:col-span-2">
          <h2 className="text-sm font-medium">Data & privacy</h2>
          <ul className="mt-3 space-y-2 text-xs leading-6 text-muted-strong">
            <li>
              Documents, chunks and conversations are scoped to your account;
              other users cannot read them by guessing identifiers.
            </li>
            <li>
              Uploaded files are stored outside the public web root and are only
              served through authenticated API calls.
            </li>
            <li>
              OCR and field extraction produce candidates, not verified facts or
              proof of authenticity.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

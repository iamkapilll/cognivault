"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";

import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/components/AuthGuard";

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/agent")) return "AI Workspace";
  if (pathname.startsWith("/research")) return "AI Research";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Documents";
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // The drawer is bound to the path it was opened on, so navigation closes
  // it without an extra render pass.
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const open = openForPath === pathname;
  const setOpen = (value: boolean) => setOpenForPath(value ? pathname : null);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenForPath(null);
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={`min-h-dvh lg:grid ${
        collapsed
          ? "lg:grid-cols-[76px_minmax(0,1fr)]"
          : "lg:grid-cols-[260px_minmax(0,1fr)]"
      }`}
    >
      <aside
        aria-label="Workspace navigation"
        className={`sidebar-surface fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 ease-out lg:block ${
          collapsed ? "w-[76px]" : "w-[260px]"
        }`}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="animate-fade-in absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="sidebar-surface animate-fade-up absolute inset-y-0 left-0 w-[min(86vw,300px)] shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="icon-button focus-ring absolute right-3 top-4 z-10 h-9 w-9 rounded-lg"
            >
              <X size={17} strokeWidth={1.8} />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </section>
        </div>
      )}

      <div className="flex min-h-dvh min-w-0 flex-col lg:col-start-2">
        <header className="app-topbar sticky top-0 z-20 flex h-[68px] shrink-0 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-expanded={open}
              className="icon-button focus-ring h-9 w-9 rounded-lg lg:hidden"
            >
              <Menu size={18} strokeWidth={1.8} />
            </button>

            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="icon-button focus-ring hidden h-9 w-9 rounded-lg lg:inline-flex"
            >
              {collapsed ? (
                <PanelLeftOpen size={17} strokeWidth={1.7} />
              ) : (
                <PanelLeftClose size={17} strokeWidth={1.7} />
              )}
            </button>

            <div className="min-w-0">
              <p className="hidden text-[10px] font-medium uppercase tracking-[0.18em] text-[#70727f] sm:block">
                Cognivault <span className="px-1.5 text-[#41434e]">/</span> Workspace
              </p>
              <p className="truncate text-sm font-semibold tracking-[-0.01em] text-[#ecebf2]">
                {pageTitle(pathname)}
              </p>
            </div>
          </div>

          <Link
            href="/settings"
            aria-label="Open account settings"
            title={user?.email ?? "Account settings"}
            className="focus-ring group flex max-w-[220px] items-center gap-2.5 rounded-full border border-transparent py-1 pl-1 pr-2 transition hover:border-[#292a35] hover:bg-white/[0.035]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#5d54ad]/40 bg-[linear-gradient(145deg,#302b55,#1d1b2d)] text-xs font-semibold text-[#c7bcff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              {user?.email?.[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="hidden min-w-0 truncate text-xs text-[#aaaab5] transition group-hover:text-white sm:block">
              {user?.email ?? "Account"}
            </span>
          </Link>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

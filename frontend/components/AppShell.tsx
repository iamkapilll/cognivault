"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "@/components/Sidebar";
import { MenuIcon, XIcon } from "@/components/icons";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The drawer is bound to the path it was opened on, so navigation closes
  // it without an extra render pass.
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const open = openForPath === pathname;
  const setOpen = (value: boolean) =>
    setOpenForPath(value ? pathname : null);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenForPath(null);
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-[#161b26] lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="animate-fade-up absolute inset-y-0 left-0 w-[280px] border-r border-[#161b26] shadow-2xl">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 z-10 rounded-md p-1.5 text-[#8b93a7] hover:bg-[#161b26]"
            >
              <XIcon width={18} height={18} />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:col-start-2">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#161b26] bg-[#07080d]/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="focus-ring rounded-lg border border-[#1e2433] p-2 text-[#c7cddd]"
          >
            <MenuIcon />
          </button>

          <span className="text-sm font-semibold">Cognivault AI</span>
          <span className="w-9" />
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

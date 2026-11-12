"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Aperture,
  FileStack,
  LogOut,
  MessageSquareText,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  deleteConversation,
  listConversations,
  type Conversation,
} from "@/lib/agent-api";
import { logoutUser } from "@/lib/auth-api";
import { useAuth } from "@/components/AuthGuard";
import { useToast } from "@/components/Toast";

function relativeTime(value: string): string {
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

export default function Sidebar({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { push } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const items = await listConversations();

        if (!cancelled) setConversations(items);
      } catch {
        // A failed history refresh must not break navigation.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHistory();

    const handler = () => void loadHistory();
    window.addEventListener("cognivault:conversations-updated", handler);

    return () => {
      cancelled = true;
      window.removeEventListener("cognivault:conversations-updated", handler);
    };
  }, [pathname]);

  async function handleLogout() {
    try {
      await logoutUser();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      push(error instanceof Error ? error.message : "Logout failed", "error");
    }
  }

  async function handleDelete(id: number) {
    setBusyId(id);

    try {
      await deleteConversation(id);

      if (window.location.search.includes(`c=${id}`)) {
        router.replace("/agent");
      }

      window.dispatchEvent(new Event("cognivault:conversations-updated"));
      push("Conversation deleted", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "Delete failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  const navItems = [
    { href: "/agent", label: "AI Workspace", icon: MessageSquareText },
    { href: "/", label: "Documents", icon: FileStack },
    { href: "/research", label: "AI Research", icon: Sparkles },
    { href: "/settings", label: "Settings", icon: Settings2 },
  ];

  return (
    <div className="flex h-full flex-col px-3 pb-3 pt-3">
      <Link
        href="/"
        onClick={onNavigate}
        className={`focus-ring flex h-12 items-center rounded-xl ${
          collapsed ? "justify-center" : "gap-3 px-2"
        }`}
        aria-label="Cognivault AI home"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#9887ff]/25 bg-[linear-gradient(145deg,#302b54,#191824)] text-[#c8bdff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_5px_20px_rgba(48,43,84,0.25)]">
          <Aperture size={18} strokeWidth={1.8} />
        </span>
        {!collapsed && (
          <span className="min-w-0 text-left">
            <span className="block text-[13px] font-semibold tracking-[-0.02em] text-[#f0eff6]">
              Cognivault <span className="font-medium text-[#aaa0e9]">AI</span>
            </span>
            <span className="mt-0.5 block text-[10px] tracking-[0.03em] text-[#777987]">
              Document intelligence
            </span>
          </span>
        )}
      </Link>

      <Link
        href="/agent"
        onClick={onNavigate}
        aria-label="Start a new chat"
        title={collapsed ? "New chat" : undefined}
        className={`button-primary focus-ring mt-4 flex h-10 items-center rounded-xl text-[13px] font-medium ${
          collapsed ? "justify-center px-0" : "justify-center gap-2 px-3"
        }`}
      >
        <Plus size={16} strokeWidth={2} />
        {!collapsed && <span>New chat</span>}
      </Link>

      <nav aria-label="Main" className="mt-6 space-y-1">
        {!collapsed && (
          <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.19em] text-[#626470]">
            Workspace
          </p>
        )}
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={`sidebar-link focus-ring min-h-10 ${
                collapsed ? "justify-center px-0" : "px-3"
              }`}
            >
              <Icon size={17} strokeWidth={1.75} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <section className="mt-7 flex min-h-0 flex-1 flex-col" aria-label="Recent conversations">
          <div className="flex items-center justify-between px-3 pb-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.19em] text-[#626470]">
              Recent chats
            </p>
            <MessageSquareText size={13} className="text-[#555763]" />
          </div>

          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
            {loading ? (
              <div className="space-y-2 px-2 pt-1">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="skeleton h-8 rounded-lg" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-3 pt-1 text-[11px] leading-5 text-[#727480]">
                No conversations yet. Start a new chat.
              </p>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="group flex items-center gap-1 rounded-lg pr-1 transition hover:bg-white/[0.035]"
                >
                  <Link
                    href={`/agent?c=${conversation.id}`}
                    onClick={onNavigate}
                    className="focus-ring min-w-0 flex-1 rounded-lg px-2.5 py-2 text-[12px] text-[#999ba7] transition hover:text-[#f0eff6]"
                  >
                    <span className="block truncate">{conversation.title}</span>
                    <span className="mt-1 block text-[10px] text-[#656773]">
                      {relativeTime(conversation.updated_at)}
                    </span>
                  </Link>

                  <button
                    type="button"
                    aria-label={`Delete ${conversation.title}`}
                    title={`Delete ${conversation.title}`}
                    disabled={busyId === conversation.id}
                    onClick={() => void handleDelete(conversation.id)}
                    className="icon-button focus-ring h-7 w-7 rounded-md text-[#777985] opacity-0 transition group-hover:opacity-100 focus:opacity-100 hover:border-red-500/25 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <div className="mt-auto border-t border-[#242631] pt-3">
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-label="Account settings"
          title={collapsed ? user?.email ?? "Account settings" : undefined}
          className={`focus-ring mb-1 flex min-h-10 items-center rounded-lg text-[12px] text-[#a5a6b1] transition hover:bg-white/[0.04] hover:text-white ${
            collapsed ? "justify-center px-0" : "gap-2.5 px-2"
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#454052] bg-[#22212b] text-[10px] font-semibold text-[#d2c6ff]">
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate">
              {user?.email ?? "Account"}
            </span>
          )}
          {!collapsed && <Settings2 size={15} className="text-[#737581]" />}
        </Link>

        <button
          type="button"
          onClick={() => void handleLogout()}
          aria-label="Log out"
          title={collapsed ? "Log out" : undefined}
          className={`sidebar-link min-h-10 w-full text-[12px] hover:border-red-500/15 hover:bg-red-500/[0.07] hover:text-red-200 ${
            collapsed ? "justify-center px-0" : "px-3"
          }`}
        >
          <LogOut size={16} strokeWidth={1.75} />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </div>
  );
}

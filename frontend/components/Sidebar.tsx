"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  deleteConversation,
  listConversations,
  type Conversation,
} from "@/lib/agent-api";
import { logoutUser } from "@/lib/auth-api";
import { useAuth } from "@/components/AuthGuard";
import { useToast } from "@/components/Toast";
import {
  ChatIcon,
  DocumentIcon,
  LogoutIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  TrashIcon,
} from "@/components/icons";

function relativeTime(value: string): string {
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
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
      push(
        error instanceof Error ? error.message : "Logout failed",
        "error",
      );
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
      push(
        error instanceof Error ? error.message : "Delete failed",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  const navItems = [
    { href: "/agent", label: "AI Workspace", icon: ChatIcon },
    { href: "/", label: "Documents", icon: DocumentIcon },
    { href: "/research", label: "AI Research", icon: SparklesIcon },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="flex h-full flex-col bg-[#080a11]">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-900/40">
          C
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-[#e7eaf3]">
            Cognivault AI
          </p>
          <p className="text-[11px] text-[#6f7890]">Document intelligence</p>
        </div>
      </div>

      <div className="px-3">
        <Link
          href="/agent"
          onClick={onNavigate}
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 transition hover:brightness-110"
        >
          <PlusIcon width={16} height={16} />
          New chat
        </Link>
      </div>

      <nav aria-label="Main" className="mt-5 space-y-1 px-3">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-[#161b29] text-white"
                  : "text-[#9aa3b8] hover:bg-[#11151f] hover:text-white"
              }`}
            >
              <item.icon width={17} height={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-5 pb-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#5d6577]">
            Recent chats
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
          {loading ? (
            <div className="space-y-2 px-2 pt-1">
              {[0, 1, 2].map((item) => (
                <div key={item} className="skeleton h-8 rounded-lg" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-3 pt-1 text-xs leading-5 text-[#5d6577]">
              No conversations yet. Start a new chat.
            </p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-[#11151f]"
              >
                <Link
                  href={`/agent?c=${conversation.id}`}
                  onClick={onNavigate}
                  className="focus-ring min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-[#9aa3b8] transition hover:text-white"
                >
                  <span className="block truncate">
                    {conversation.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[#5d6577]">
                    {relativeTime(conversation.updated_at)}
                  </span>
                </Link>

                <button
                  type="button"
                  aria-label={`Delete ${conversation.title}`}
                  disabled={busyId === conversation.id}
                  onClick={() => void handleDelete(conversation.id)}
                  className="focus-ring rounded-md p-1.5 text-[#5d6577] opacity-0 transition hover:bg-red-500/10 hover:text-red-300 focus:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-[#161b26] p-3">
        <Link
          href="/settings"
          onClick={onNavigate}
          className="focus-ring mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#9aa3b8] transition hover:bg-[#11151f] hover:text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1a2030] text-[11px] font-semibold text-indigo-300">
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {user?.email ?? "Account"}
          </span>
        </Link>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#9aa3b8] transition hover:bg-red-500/10 hover:text-red-300"
        >
          <LogoutIcon width={17} height={17} />
          Log out
        </button>
      </div>
    </div>
  );
}

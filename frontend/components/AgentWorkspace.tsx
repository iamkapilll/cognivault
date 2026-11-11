"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/Toast";
import {
  approveAgentAction,
  createConversation,
  getConversation,
  getConversationMessages,
  renameConversation,
  streamAgentChat,
  type Conversation,
  type PendingApproval,
} from "@/lib/agent-api";
import {
  getDocuments,
  uploadDocumentWithProgress,
  type ApiDocument,
} from "@/lib/api";
import {
  CheckIcon,
  PaperclipIcon,
  SendIcon,
  SparklesIcon,
  XIcon,
} from "@/components/icons";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

const MAX_SIZE = 10 * 1024 * 1024;
const EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const SUGGESTIONS = [
  "Summarize my most recent indexed document.",
  "Which documents mention payment terms?",
  "Compare my two latest reports and list the differences.",
];

function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function MessageBody({ content }: { content: string }) {
  const parts = content.split("```");

  return (
    <div className="prose-chat whitespace-pre-wrap break-words text-sm leading-7 text-[#d5dae6]">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <pre key={index}>
            <code>{part.replace(/^[a-zA-Z0-9_-]+\n/, "")}</code>
          </pre>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </div>
  );
}

export default function AgentWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { push } = useToast();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "loading">(
    "idle",
  );

  const [attachments, setAttachments] = useState<ApiDocument[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [tools, setTools] = useState<string[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [error, setError] = useState("");

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const conversationRef = useRef<Conversation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = status !== "idle";

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  const cParam = searchParams.get("c");

  useEffect(() => {
    if (!cParam) {
      if (conversationRef.current !== null) {
        setConversation(null);
        setMessages([]);
        setApprovals([]);
        setTools([]);
        setAttachments([]);
      }
      return;
    }

    const id = Number(cParam);

    if (!Number.isFinite(id) || conversationRef.current?.id === id) {
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setApprovals([]);
    setTools([]);
    setError("");

    Promise.all([
      getConversation(id),
      getConversationMessages(id),
      getDocuments(),
    ])
      .then(([meta, history, documents]) => {
        if (cancelled) return;

        setConversation(meta);
        const documentsById = new Map(
          documents.map((document) => [document.id, document]),
        );
        setAttachments(
          meta.document_ids
            .map((documentId) => documentsById.get(documentId))
            .filter((document): document is ApiDocument => document !== undefined),
        );
        setApprovals(history.pending_approvals);
        setMessages(
          history.messages.map((message) => ({
            id: newId(),
            role: message.role,
            content: message.content,
          })),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load conversation",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [cParam]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tools, approvals]);

  const notifyHistory = useCallback(() => {
    window.dispatchEvent(new Event("cognivault:conversations-updated"));
  }, []);

  async function ensureConversation(): Promise<Conversation> {
    if (conversationRef.current) return conversationRef.current;

    const created = await createConversation(
      attachments.map((item) => item.id),
    );

    setConversation(created);
    conversationRef.current = created;
    router.replace(`/agent?c=${created.id}`, { scroll: false });
    notifyHistory();

    return created;
  }

  async function send(text: string) {
    const message = text.trim();

    if (!message || busy) return;

    setError("");
    setStatus("streaming");

    const assistantId = newId();

    try {
      const active = await ensureConversation();
      const documentIds = attachments.map((item) => item.id);

      setMessages((current) => [
        ...current,
        { id: newId(), role: "user", content: message },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          streaming: true,
        },
      ]);

      setInput("");
      setTools([]);

      const controller = new AbortController();
      abortRef.current = controller;

      await streamAgentChat(
        active.id,
        message,
        documentIds,
        {
          onToken: (token) => {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? { ...item, content: item.content + token }
                  : item,
              ),
            );
          },
          onTool: (name, toolStatus) => {
            setTools((current) =>
              toolStatus === "started"
                ? [...current, name]
                : current.filter((item) => item !== name),
            );
          },
          onApproval: (pending) => setApprovals(pending),
          onDone: (_status, answer) => {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? {
                      ...item,
                      content: answer ?? item.content,
                      streaming: false,
                    }
                  : item,
              ),
            );
          },
          onError: (streamError) => {
            setError(streamError);
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? {
                      ...item,
                      content:
                        item.content ||
                        "The agent could not complete this request.",
                      streaming: false,
                    }
                  : item,
              ),
            );
          },
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, streaming: false }
              : item,
          ),
        );
      } else {
        setError(err instanceof Error ? err.message : "Request failed");
      }
    } finally {
      abortRef.current = null;
      setStatus("idle");
      setTools([]);
      notifyHistory();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStatus("idle");
    setTools([]);
  }

  async function handleAttachment(file: File) {
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    if (!EXTENSIONS.includes(extension)) {
      push("Attach a PDF, JPG, JPEG, or PNG file.", "error");
      return;
    }

    if (file.size > MAX_SIZE) {
      push("Maximum attachment size is 10 MB.", "error");
      return;
    }

    if (attachments.length >= 5) {
      push("You can attach up to 5 documents per message.", "error");
      return;
    }

    try {
      setUploadProgress(0);
      const document = await uploadDocumentWithProgress(
        file,
        setUploadProgress,
      );

      setAttachments((current) => [...current, document]);
      push(
        document.index_status === "indexed"
          ? `${document.filename} attached and indexed.`
          : `${document.filename} attached. Indexing needs a retry.`,
        "success",
      );
    } catch (err) {
      push(
        err instanceof Error ? err.message : "Attachment upload failed",
        "error",
      );
    } finally {
      setUploadProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!conversation || busy) return;

    try {
      setStatus("loading");
      const result = await approveAgentAction(conversation.id, decision);

      setApprovals(result.pending_approvals);
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: "assistant",
          content:
            result.answer ??
            (decision === "approve"
              ? "Action approved."
              : "Action rejected."),
        },
      ]);

      notifyHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Approval request failed",
      );
    } finally {
      setStatus("idle");
    }
  }

  async function commitRename() {
    if (!conversation) return;

    const title = titleDraft.trim();

    if (!title || title === conversation.title) {
      setRenaming(false);
      return;
    }

    try {
      const updated = await renameConversation(conversation.id, title);
      setConversation(updated);
      notifyHistory();
    } catch (err) {
      push(err instanceof Error ? err.message : "Rename failed", "error");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col lg:h-dvh">
      <header className="flex items-center justify-between gap-4 border-b border-[#161b26] px-5 py-4 md:px-8">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void commitRename();
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                maxLength={120}
                aria-label="Conversation title"
                className="focus-ring w-full max-w-md rounded-lg border border-[#2a3142] bg-[#0b0e17] px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                aria-label="Save title"
                className="rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/10"
              >
                <CheckIcon width={16} height={16} />
              </button>
              <button
                type="button"
                aria-label="Cancel rename"
                onClick={() => setRenaming(false)}
                className="rounded-md p-1.5 text-[#8b93a7] hover:bg-[#161b26]"
              >
                <XIcon width={16} height={16} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!conversation) return;
                setTitleDraft(conversation.title);
                setRenaming(true);
              }}
              className="focus-ring max-w-full truncate rounded text-left text-base font-medium hover:text-indigo-300"
              title={conversation ? "Rename conversation" : undefined}
            >
              {conversation?.title ?? "New conversation"}
            </button>
          )}

          <p className="mt-0.5 text-[11px] text-[#6f7890]">
            {attachments.length > 0
              ? `${attachments.length} document${attachments.length > 1 ? "s" : ""} in context`
              : "Documents, OCR, RAG, web research and approvals"}
          </p>
        </div>

        {busy && (
          <button
            type="button"
            onClick={stop}
            className="focus-ring rounded-lg border border-[#2a3142] px-3 py-1.5 text-xs text-[#c7cddd] hover:border-red-500/40 hover:text-red-300"
          >
            Stop
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
        {status === "loading" ? (
          <div className="mx-auto max-w-3xl space-y-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center pt-10 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-indigo-300 ring-1 ring-indigo-500/30">
              <SparklesIcon width={26} height={26} />
            </div>

            <h1 className="text-2xl font-semibold tracking-tight">
              What should we research?
            </h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#8b93a7]">
              Ask about your indexed documents, search the web, compare files,
              or request a deletion that needs your approval.
            </p>

            <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="focus-ring rounded-xl border border-[#1e2433] bg-[#0b0e17] p-4 text-left text-xs leading-5 text-[#9aa3b8] transition hover:border-indigo-500/40 hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-3 text-sm leading-7 text-white shadow-lg shadow-indigo-950/30">
                    <MessageBody content={message.content} />
                  </div>
                </div>
              ) : (
                <div key={message.id} className="flex gap-3">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#161b29] text-[11px] font-semibold text-indigo-300 ring-1 ring-[#2a3142]">
                    AI
                  </div>

                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-[#1e2433] bg-[#0b0e17] px-4 py-3">
                    {message.content ? (
                      <MessageBody content={message.content} />
                    ) : (
                      <div className="flex items-center gap-2 py-1 text-xs text-[#8b93a7]">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-400" />
                        Thinking…
                      </div>
                    )}

                    {message.streaming && message.content && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-indigo-400 align-middle" />
                    )}
                  </div>
                </div>
              ),
            )}

            {tools.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-11">
                {tools.map((tool) => (
                  <span
                    key={tool}
                    className="flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-[11px] text-indigo-200"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                    {tool.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            )}

            {approvals.map((approval) => (
              <div
                key={`${approval.document_id}-${approval.action}`}
                className="ml-11 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
              >
                <p className="text-sm font-medium text-amber-200">
                  Approval required
                </p>
                <p className="mt-1 text-xs leading-6 text-amber-100/80">
                  {approval.message}
                </p>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("approve")}
                    className="focus-ring rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Approve deletion
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide("reject")}
                    className="focus-ring rounded-lg border border-[#2a3142] px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        )}

        {error && (
          <div className="mx-auto mt-4 flex max-w-3xl items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-200">
            <span className="leading-6">{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="rounded p-1 hover:bg-red-500/10"
            >
              <XIcon width={14} height={14} />
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-[#161b26] bg-[#07080d]/90 px-4 py-4 backdrop-blur md:px-8">
        <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((document) => (
                <span
                  key={document.id}
                  className="flex items-center gap-2 rounded-full border border-[#2a3142] bg-[#11151f] px-3 py-1 text-[11px] text-[#c7cddd]"
                >
                  <PaperclipIcon width={12} height={12} />
                  <span className="max-w-[180px] truncate">
                    {document.filename}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${document.filename}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== document.id),
                      )
                    }
                    className="text-[#6f7890] hover:text-red-300"
                  >
                    <XIcon width={12} height={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {uploadProgress !== null && (
            <div className="mb-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-[#1a2030]">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-[#6f7890]">
                {uploadProgress < 100
                  ? `Uploading… ${uploadProgress}%`
                  : "Extracting and indexing…"}
              </p>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-[#1e2433] bg-[#0b0e17] p-2 focus-within:border-indigo-500/50">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleAttachment(file);
              }}
            />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadProgress !== null || attachments.length >= 5}
              aria-label="Attach a document"
              className="focus-ring rounded-xl p-2.5 text-[#8b93a7] transition hover:bg-[#161b26] hover:text-white disabled:opacity-40"
            >
              <PaperclipIcon />
            </button>

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={4000}
              disabled={busy || approvals.length > 0}
              placeholder={
                approvals.length > 0
                  ? "Resolve the approval above to continue…"
                  : "Ask about your documents…"
              }
              aria-label="Message"
              className="max-h-40 min-h-[42px] flex-1 resize-none bg-transparent px-1 py-2.5 text-sm leading-6 outline-none placeholder:text-[#5d6577] disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!input.trim() || busy || approvals.length > 0}
              aria-label="Send message"
              className="focus-ring rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-2.5 text-white transition hover:brightness-110 disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </div>

          <p className="mt-2 text-center text-[10px] text-[#5d6577]">
            AI output can be wrong. Verify important information. Deletions
            always require approval.
          </p>
        </form>
      </div>
    </div>
  );
}

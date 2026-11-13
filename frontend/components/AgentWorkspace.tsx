"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  FormEvent,
  KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  FileSearch,
  FileText,
  Globe2,
  LoaderCircle,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { MarkdownContent } from "@/components/MarkdownContent";
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

type ToolActivity = {
  name: string;
  status: "running" | "completed" | "cancelled";
};

const MAX_SIZE = 10 * 1024 * 1024;
const EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const STARTERS: {
  title: string;
  detail: string;
  prompt: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Summarize a document",
    detail: "Get the key ideas from a recent file",
    prompt: "Summarize my most recent indexed document.",
    icon: FileText,
  },
  {
    title: "Find a specific detail",
    detail: "Locate terms, dates, or decisions",
    prompt: "Which documents mention payment terms or deadlines?",
    icon: FileSearch,
  },
  {
    title: "Compare documents",
    detail: "Surface differences across reports",
    prompt: "Compare my two most recent reports and list the differences.",
    icon: BookOpen,
  },
  {
    title: "Explore a topic",
    detail: "Combine your files with web research",
    prompt: "Research the latest information related to my documents.",
    icon: Globe2,
  },
];

function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function documentStatusTone(document: ApiDocument): string {
  if (
    document.status.includes("fail") ||
    document.index_status.includes("fail") ||
    document.review_status.includes("needs")
  ) {
    return "text-muted-strong";
  }
  if (document.index_status === "indexed") return "text-success";
  return "text-muted-strong";
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
  const [libraryDocuments, setLibraryDocuments] = useState<ApiDocument[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const conversationRef = useRef<Conversation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = status !== "idle";
  const cParam = searchParams.get("c");

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    let cancelled = false;

    getDocuments()
      .then((documents) => {
        if (!cancelled) setLibraryDocuments(documents);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          push(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your document library.",
            "error",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [push]);

  useEffect(() => {
    if (!cParam) {
      if (conversationRef.current !== null) {
        setConversation(null);
        setMessages([]);
        setApprovals([]);
        setTools([]);
        setAttachments([]);
        setError("");
      }
      return;
    }

    const id = Number(cParam);
    if (!Number.isFinite(id) || conversationRef.current?.id === id) return;

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
            .filter(
              (document): document is ApiDocument =>
                document !== undefined,
            ),
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
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load conversation.",
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, tools, approvals]);

  const notifyHistory = useCallback(() => {
    window.dispatchEvent(new Event("cognivault:conversations-updated"));
  }, []);

  async function ensureConversation(): Promise<Conversation> {
    if (conversationRef.current) return conversationRef.current;

    const created = await createConversation(
      attachments.map((document) => document.id),
    );
    setConversation(created);
    conversationRef.current = created;
    router.replace(`/agent?c=${created.id}`, { scroll: false });
    notifyHistory();
    return created;
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || approvals.length > 0) return;

    setError("");
    setStatus("streaming");
    setTools([]);
    const assistantId = newId();

    try {
      const active = await ensureConversation();
      const documentIds = attachments.map((document) => document.id);

      setMessages((current) => [
        ...current,
        { id: newId(), role: "user", content: message },
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

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
                ? [...current, { name, status: "running" }]
                : current.map((tool) =>
                    tool.name === name ? { ...tool, status: "completed" } : tool,
                  ),
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
    } catch (sendError: unknown) {
      if (
        sendError instanceof Error &&
        sendError.name === "AbortError"
      ) {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId ? { ...item, streaming: false } : item,
          ),
        );
      } else {
        setError(
          sendError instanceof Error ? sendError.message : "Request failed.",
        );
      }
    } finally {
      abortRef.current = null;
      setStatus("idle");
      notifyHistory();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send(input);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStatus("idle");
    setTools((current) =>
      current.map((tool) =>
        tool.status === "running" ? { ...tool, status: "cancelled" } : tool,
      ),
    );
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
      setLibraryDocuments((current) => [
        document,
        ...current.filter((item) => item.id !== document.id),
      ]);
      push(
        document.index_status === "indexed"
          ? `${document.filename} attached and indexed.`
          : `${document.filename} attached. Indexing needs a retry.`,
        document.index_status === "indexed" ? "success" : "info",
      );
    } catch (uploadError: unknown) {
      push(
        uploadError instanceof Error
          ? uploadError.message
          : "Attachment upload failed.",
        "error",
      );
    } finally {
      setUploadProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleLibraryDocument(document: ApiDocument) {
    setAttachments((current) =>
      current.some((item) => item.id === document.id)
        ? current.filter((item) => item.id !== document.id)
        : current.length < 5
          ? [...current, document]
          : current,
    );
    if (
      attachments.length >= 5 &&
      !attachments.some((item) => item.id === document.id)
    ) {
      push("You can attach up to 5 documents per message.", "info");
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
            (decision === "approve" ? "Action approved." : "Action rejected."),
        },
      ]);
      notifyHistory();
    } catch (approvalError: unknown) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Approval request failed.",
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
    } catch (renameError: unknown) {
      push(
        renameError instanceof Error ? renameError.message : "Rename failed.",
        "error",
      );
    } finally {
      setRenaming(false);
    }
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      push("Response copied to clipboard.", "success");
    } catch (copyError: unknown) {
      push(
        copyError instanceof Error ? copyError.message : "Could not copy response.",
        "error",
      );
    }
  }

  const filteredDocuments = libraryDocuments.filter((document) =>
    document.filename.toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()),
  );
  const activeAttachments = conversation ? attachments : [];
  const contextClass = contextOpen
    ? "absolute inset-0 z-20 flex w-full flex-col xl:static xl:z-auto xl:w-[318px] xl:shrink-0"
    : "hidden xl:flex xl:w-[318px] xl:shrink-0 xl:flex-col";

  return (
    <div className="relative flex h-[calc(100dvh-68px)] min-h-[520px] flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[62px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.065] px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-strong sm:flex">
                <Sparkles size={16} strokeWidth={1.7} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
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
                        className="control-input h-8 w-full max-w-sm rounded-lg px-2 text-sm"
                      />
                      <button
                        type="submit"
                        aria-label="Save title"
                        className="focus-ring rounded-md p-1.5 text-muted-strong hover:bg-surface-2 hover:text-foreground"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setRenaming(false)}
                        className="focus-ring rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
                      >
                        <X size={15} />
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
                      title={conversation ? "Rename conversation" : undefined}
                      className="focus-ring max-w-full truncate rounded text-left hover:text-foreground"
                    >
                      {conversation?.title ?? "New research session"}
                    </button>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted">
                  {attachments.length
                    ? `${attachments.length} document${attachments.length === 1 ? "" : "s"} in context`
                    : "Private research across your documents and the web"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[10px] text-muted-strong sm:inline-flex">
                <ShieldCheck size={12} className="text-muted-strong" />
                Private workspace
              </span>
              <button
                type="button"
                onClick={() => setContextOpen(true)}
                aria-label="Open document context"
                className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[11px] text-muted-strong transition hover:border-border-strong hover:text-foreground xl:hidden"
              >
                <BookOpen size={14} />
                Sources
              </button>
              {busy && (
                <button
                  type="button"
                  onClick={stop}
                  className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-muted-strong hover:border-border-strong hover:bg-surface-2 hover:text-foreground"
                >
                  <span className="h-1.5 w-1.5 rounded-sm bg-muted-strong" />
                  Stop
                </button>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-6 sm:px-6 lg:px-8">
            {status === "loading" && messages.length === 0 ? (
              <div className="mx-auto max-w-3xl space-y-5 pt-4">
                <div className="skeleton h-20 rounded-2xl" />
                <div className="skeleton ml-auto h-16 max-w-[70%] rounded-2xl" />
                <div className="skeleton h-28 rounded-2xl" />
              </div>
            ) : messages.length === 0 ? (
              <div className="mx-auto w-full max-w-[860px] pb-6 pt-5 sm:pt-8">
                <div className="mb-7 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-medium tracking-[0.03em] text-muted-strong">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-strong" />
                    Cognivault research workspace
                  </span>
                  <span className="text-[10px] text-muted">
                    {libraryLoading
                      ? "Loading your library…"
                      : `${libraryDocuments.length} ${libraryDocuments.length === 1 ? "document" : "documents"} available`}
                  </span>
                </div>

                <div className="surface-card relative overflow-hidden rounded-[26px] p-5 sm:p-8 lg:p-9">
                  <div className="relative max-w-[640px]">
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-[14px] border border-border-strong bg-surface-2 text-muted-strong">
                      <Sparkles size={20} strokeWidth={1.6} />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-strong">
                      Your thinking partner
                    </p>
                    <h1 className="mt-2 text-[31px] font-semibold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-[38px]">
                      Make sense of
                      <br className="hidden sm:block" /> what you know.
                    </h1>
                    <p className="mt-3 max-w-[530px] text-[13px] leading-6 text-muted-strong sm:text-[14px]">
                      Ask a question, connect the dots across your files, or
                      explore a topic. Your documents stay close to the answer.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <FileSearch size={13} className="text-muted-strong" />
                        Document-grounded
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Globe2 size={13} className="text-muted-strong" />
                        Web research
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-muted-strong" />
                        Human-approved actions
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mb-3 mt-8 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted">
                      A good place to begin
                    </p>
                    <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                      Start with a question
                    </h2>
                  </div>
                  <span className="hidden text-[10px] text-muted sm:block">
                    Choose a prompt or write your own
                  </span>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {STARTERS.map(({ title, detail, prompt, icon: Icon }) => (
                    <button
                      key={title}
                      type="button"
                      onClick={() => void send(prompt)}
                      disabled={busy}
                      className="focus-ring group flex min-h-[82px] items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left transition duration-200 hover:border-border-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-55 sm:p-4"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-strong transition group-hover:border-border-strong group-hover:text-foreground">
                        <Icon size={17} strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-foreground">
                          {title}
                        </span>
                        <span className="mt-1 block text-[10px] leading-4 text-muted-strong">
                          {detail}
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground"
                      />
                    </button>
                  ))}
                </div>

                {attachments.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {attachments.map((document) => (
                      <span
                        key={document.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[10px] text-muted-strong"
                      >
                        <FileText size={13} />
                        {document.filename}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-[780px] space-y-7 pb-5">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <article
                      key={message.id}
                      className="animate-fade-up flex flex-col items-end gap-2"
                    >
                      <span className="px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                        You
                      </span>
                      <div className="max-w-[88%] rounded-2xl rounded-tr-md border border-border-strong bg-surface-2 px-4 py-3.5 text-foreground sm:max-w-[78%] sm:px-5">
                        <MarkdownContent content={message.content} />
                      </div>
                    </article>
                  ) : (
                    <article
                      key={message.id}
                      className="animate-fade-up flex gap-3 sm:gap-4"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-strong">
                        <Sparkles size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold tracking-[0.01em] text-foreground">
                            Cognivault
                          </span>
                          {!message.streaming && message.content && (
                            <button
                              type="button"
                              onClick={() => void copyMessage(message.content)}
                              className="focus-ring rounded-md px-2 py-1 text-[10px] text-muted transition hover:bg-surface-2 hover:text-foreground"
                            >
                              Copy response
                            </button>
                          )}
                        </div>
                        {message.content ? (
                          <MarkdownContent content={message.content} />
                        ) : (
                          <div
                            role="status"
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[11px] text-muted-strong"
                          >
                            <LoaderCircle
                              size={14}
                              className="animate-spin text-accent-2"
                            />
                            Thinking through your sources…
                          </div>
                        )}
                        {message.streaming && message.content && (
                          <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded bg-accent align-middle" />
                        )}
                      </div>
                    </article>
                  ),
                )}

                {tools.length > 0 && (
                  <section
                    aria-label="Agent activity"
                    className="ml-11 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                  >
                    <p className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      Research activity
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tools.map((tool, index) => (
                        <span
                          key={`${tool.name}-${index}`}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] ${
                            tool.status === "running"
                              ? "border-border-strong bg-surface-2 text-muted-strong"
                              : tool.status === "completed"
                                ? "border-success/15 bg-success/[0.045] text-success"
                                : "border-border bg-surface text-muted-strong"
                          }`}
                        >
                          {tool.status === "running" ? (
                            <LoaderCircle size={11} className="animate-spin" />
                          ) : tool.status === "completed" ? (
                            <Check size={11} />
                          ) : (
                            <X size={11} />
                          )}
                          {tool.name.replaceAll("_", " ")}
                          <span className="text-current/60">
                            {tool.status === "running"
                              ? "working"
                              : tool.status === "completed"
                                ? "done"
                                : "stopped"}
                          </span>
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {approvals.map((approval) => (
                  <section
                    key={`${approval.document_id}-${approval.action}`}
                    className="ml-11 rounded-2xl border border-border bg-surface p-4 sm:p-5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-strong">
                        <CircleHelp size={16} />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-[13px] font-semibold text-foreground">
                          Your approval is needed
                        </h2>
                        <p className="mt-1 text-[11px] leading-5 text-muted-strong">
                          {approval.message}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 pl-11">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide("approve")}
                        className="button-primary focus-ring min-h-9 rounded-lg px-3 text-[11px] font-medium disabled:opacity-50"
                      >
                        Approve deletion
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide("reject")}
                        className="button-secondary focus-ring min-h-9 rounded-lg px-3 text-[11px] disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </section>
                ))}
                <div ref={bottomRef} />
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mx-auto mt-5 flex max-w-[780px] items-start justify-between gap-3 rounded-xl border border-error/20 bg-error/[0.055] px-4 py-3 text-[11px] text-error"
              >
                <span className="leading-5">{error}</span>
                <button
                  type="button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                  className="focus-ring rounded-md p-1 text-error/65 hover:bg-error/10 hover:text-error"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-background px-3 pb-3 pt-3 sm:px-6 sm:pb-4">
            <form onSubmit={onSubmit} className="mx-auto max-w-[780px]">
              {attachments.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-2">
                  {attachments.map((document) => (
                    <span
                      key={document.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface-2 py-1.5 pl-2.5 pr-1.5 text-[10px] text-muted-strong"
                    >
                      <FileText size={13} className="shrink-0 text-muted-strong" />
                      <span className="max-w-[210px] truncate">
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
                        className="focus-ring rounded p-1 text-muted hover:bg-surface-3 hover:text-foreground"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {uploadProgress !== null && (
                <div className="mb-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[9px] text-muted-strong">
                    {uploadProgress < 100
                      ? `Uploading document · ${uploadProgress}%`
                      : "Extracting and indexing…"}
                  </p>
                </div>
              )}

              <div className="group rounded-[20px] border border-border bg-surface p-2 shadow-[var(--shadow-panel)] transition focus-within:border-accent/60 focus-within:bg-surface-2 hover:border-border-strong">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    event.currentTarget.style.height = "auto";
                    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={onKeyDown}
                  rows={1}
                  maxLength={4000}
                  disabled={busy || approvals.length > 0}
                  placeholder={
                    approvals.length > 0
                      ? "Resolve the approval above to continue…"
                      : "Ask anything about your documents or a topic…"
                  }
                  aria-label="Message"
                  className="max-h-40 min-h-[42px] w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-6 text-foreground outline-none placeholder:text-muted disabled:opacity-60"
                />
                <div className="flex items-center justify-between gap-2 border-t border-white/[0.055] px-1 pt-2">
                  <div className="flex items-center gap-1">
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
                      disabled={
                        busy ||
                        uploadProgress !== null ||
                        attachments.length >= 5
                      }
                      aria-label="Attach a document"
                      title="Attach a PDF or image"
                      className="focus-ring inline-flex h-8 items-center gap-2 rounded-lg px-2 text-[10px] text-muted-strong transition hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Paperclip size={14} />
                      <span className="hidden sm:inline">Attach</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContextOpen(true)}
                      className="focus-ring hidden h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] text-muted transition hover:bg-surface-2 hover:text-foreground xl:inline-flex"
                    >
                      <BookOpen size={13} />
                      {attachments.length
                        ? `${attachments.length} in context`
                        : "Add sources"}
                      <ChevronDown size={11} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="hidden text-[9px] text-muted sm:inline">
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.025] px-1 py-0.5 font-sans">
                        Enter
                      </kbd>{" "}
                      to send · Shift + Enter for a new line
                    </span>
                    <button
                      type="submit"
                      disabled={
                        !input.trim() || busy || approvals.length > 0
                      }
                      aria-label="Send message"
                      className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl border border-accent bg-accent text-background transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2 disabled:text-muted"
                    >
                      <ArrowUp size={16} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              </div>

              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[9px] leading-4 text-muted">
                <ShieldCheck size={11} className="shrink-0" />
                Verify important information. Destructive actions always need your approval.
              </p>
            </form>
          </div>
        </section>

        <aside
          aria-label="Document context"
          className={`${contextClass} border-l border-border bg-surface`}
        >
          <div className="flex min-h-[62px] shrink-0 items-center justify-between border-b border-white/[0.065] px-4">
            <div>
              <p className="text-[12px] font-semibold text-foreground">
                Source context
              </p>
              <p className="mt-0.5 text-[10px] text-muted">
                Files the assistant can reference
              </p>
            </div>
            <button
              type="button"
              onClick={() => setContextOpen(false)}
              aria-label="Close document context"
              className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground xl:hidden"
            >
              <X size={15} />
            </button>
            <span className="hidden h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-strong xl:flex">
              <BookOpen size={15} />
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="rounded-xl border border-border bg-surface-2 p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-strong">
                  <ShieldCheck size={14} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-muted-strong">
                    Private by design
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-strong">
                    Attached files narrow document search. Without an attachment,
                    the assistant can search your indexed library.
                  </p>
                </div>
              </div>
            </div>

            {conversation ? (
              <section className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-strong">
                    In this conversation
                  </h2>
                  <span className="text-[10px] text-muted">
                    {activeAttachments.length}
                  </span>
                </div>
                {activeAttachments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-[10px] leading-5 text-muted">
                    No files were attached to this conversation.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeAttachments.map((document) => (
                      <div
                        key={document.id}
                        className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-strong">
                          <FileText size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] font-medium text-foreground">
                            {document.filename}
                          </span>
                          <span
                            className={`mt-1 block text-[9px] capitalize ${documentStatusTone(document)}`}
                          >
                            {document.index_status.replaceAll("_", " ")}
                            {document.page_count
                              ? ` · ${document.page_count} pages`
                              : ""}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Link
                  href="/"
                  className="focus-ring mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] text-muted-strong transition hover:bg-surface-2 hover:text-foreground"
                >
                  Manage documents
                  <ArrowRight size={12} />
                </Link>
              </section>
            ) : (
              <section className="mt-6">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-strong">
                      Your library
                    </h2>
                    <p className="mt-1 text-[9px] text-muted">
                      Select up to five files for this chat
                    </p>
                  </div>
                  <span className="rounded-md border border-border bg-surface px-2 py-1 text-[9px] text-muted-strong">
                    {attachments.length}/5
                  </span>
                </div>

                <label className="relative mt-3 block">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    type="search"
                    value={libraryQuery}
                    onChange={(event) => setLibraryQuery(event.target.value)}
                    aria-label="Search your documents"
                    placeholder="Search documents"
                    className="control-input h-9 w-full rounded-lg pl-8 pr-2 text-[10px]"
                  />
                </label>

                <div className="mt-2 space-y-1.5">
                  {libraryLoading ? (
                    [0, 1, 2].map((item) => (
                      <div key={item} className="skeleton h-[54px] rounded-xl" />
                    ))
                  ) : filteredDocuments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/[0.09] px-3 py-5 text-center">
                      <FileText size={17} className="mx-auto text-muted" />
                      <p className="mt-2 text-[10px] text-muted-strong">
                        {libraryDocuments.length
                          ? "No files match your search."
                          : "Your library is empty."}
                      </p>
                      {!libraryDocuments.length && (
                        <Link
                          href="/"
                          className="focus-ring mt-2 inline-flex items-center gap-1 text-[10px] text-muted-strong hover:text-foreground"
                        >
                          Upload a document
                          <ArrowRight size={11} />
                        </Link>
                      )}
                    </div>
                  ) : (
                    filteredDocuments.slice(0, 8).map((document) => {
                      const selected = attachments.some(
                        (item) => item.id === document.id,
                      );
                      return (
                        <button
                          key={document.id}
                          type="button"
                          onClick={() => toggleLibraryDocument(document)}
                          aria-pressed={selected}
                          className={`focus-ring flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${
                            selected
                              ? "border-border-strong bg-surface-2"
                              : "border-white/[0.06] bg-white/[0.018] hover:border-white/[0.12] hover:bg-white/[0.035]"
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              selected
                                ? "bg-surface-3 text-foreground"
                                : "bg-surface-2 text-muted-strong"
                            }`}
                          >
                            <FileText size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[10px] font-medium text-foreground">
                              {document.filename}
                            </span>
                            <span
                              className={`mt-1 block text-[9px] capitalize ${documentStatusTone(document)}`}
                            >
                              {document.index_status.replaceAll("_", " ")}
                            </span>
                          </span>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              selected
                                ? "border-foreground bg-foreground text-background"
                                : "border-white/[0.1] text-transparent"
                            }`}
                          >
                            {selected ? <Check size={12} /> : <Plus size={12} />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {filteredDocuments.length > 8 && (
                  <p className="mt-2 text-center text-[9px] text-muted">
                    Showing 8 of {filteredDocuments.length} files. Search to find the rest.
                  </p>
                )}
              </section>
            )}

            <section className="mt-7 border-t border-white/[0.06] pt-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-strong">
                Research tools
              </h2>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[10px] text-muted-strong">
                  <FileSearch size={13} className="text-muted-strong" />
                  Search your indexed files
                </div>
                <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[10px] text-muted-strong">
                  <Globe2 size={13} className="text-muted-strong" />
                  Explore the web
                </div>
                <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[10px] text-muted-strong">
                  <ShieldCheck size={13} className="text-muted-strong" />
                  Approve sensitive actions
                </div>
              </div>
            </section>
          </div>

          <div className="border-t border-white/[0.06] px-4 py-3">
            <p className="text-[9px] leading-4 text-muted">
              Answers can be wrong. Check important claims against the source.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DragEvent, FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  FileImage,
  Files,
  Layers3,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { useToast } from "@/components/Toast";
import {
  deleteDocument,
  getDocumentAnalysis,
  getDocumentText,
  getDocuments,
  indexDocument,
  uploadDocumentWithProgress,
  type ApiDocument,
  type DocumentAnalysis,
  type DocumentText,
} from "@/lib/api";
const MAX_SIZE = 10 * 1024 * 1024;
const EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function badgeClass(value: string): string {
  if (value.includes("indexed") || value.includes("completed")) {
    return "border-success/20 bg-success/[0.08] text-success";
  }
  if (value.includes("fail")) {
    return "border-error/20 bg-error/[0.08] text-error";
  }
  if (value.includes("needs")) {
    return "border-border-strong bg-surface-2 text-muted-strong";
  }
  return "border-border bg-surface-2 text-muted-strong";
}

export default function DocumentsPage() {
  const { push } = useToast();

  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [detail, setDetail] = useState<
    | { kind: "text"; data: DocumentText }
    | { kind: "analysis"; data: DocumentAnalysis }
    | null
  >(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<ApiDocument | null>(null);

  const load = useCallback(async () => {
    try {
      setDocuments(await getDocuments({ q: query, status: statusFilter }));
    } catch (error) {
      push(
        error instanceof Error ? error.message : "Could not load documents",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter, push]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleUpload(file: File) {
    const extension = file.name
      .slice(file.name.lastIndexOf("."))
      .toLowerCase();

    if (!EXTENSIONS.includes(extension)) {
      push("Choose a PDF, JPG, JPEG, or PNG file.", "error");
      return;
    }

    if (file.size > MAX_SIZE) {
      push("Maximum file size is 10 MB.", "error");
      return;
    }

    try {
      setUploading(true);
      setProgress(0);

      const document = await uploadDocumentWithProgress(file, setProgress);

      push(
        document.index_status === "indexed"
          ? "Uploaded, extracted, and indexed."
          : "Uploaded and extracted. Indexing needs a retry.",
        document.index_status === "indexed" ? "success" : "info",
      );

      await load();
    } catch (error) {
      push(
        error instanceof Error ? error.message : "Upload failed",
        "error",
      );
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);

    const file = event.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  }

  async function openText(document: ApiDocument) {
    try {
      setDetailLoading(true);
      setDetail({ kind: "text", data: await getDocumentText(document.id) });
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not load text", "error");
    } finally {
      setDetailLoading(false);
    }
  }

  async function openAnalysis(document: ApiDocument) {
    try {
      setDetailLoading(true);
      setDetail({
        kind: "analysis",
        data: await getDocumentAnalysis(document.id),
      });
    } catch (error) {
      push(
        error instanceof Error ? error.message : "Could not load analysis",
        "error",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function reindex(document: ApiDocument) {
    try {
      setBusyId(document.id);
      const result = await indexDocument(document.id);
      push(`Indexed ${result.chunks_created} chunks.`, "success");
      await load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Indexing failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(document: ApiDocument) {
    try {
      setBusyId(document.id);
      await deleteDocument(document.id);
      setConfirming(null);
      push("Document deleted.", "success");
      await load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Delete failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  const indexedCount = documents.filter(
    (document) => document.index_status === "indexed",
  ).length;
  const needsAttentionCount = documents.filter(
    (document) =>
      document.status.includes("fail") ||
      document.status.includes("needs") ||
      document.index_status.includes("fail") ||
      document.index_status.includes("needs"),
  ).length;
  const processedPages = documents.reduce(
    (total, document) => total + (document.page_count ?? 0),
    0,
  );

  const stats = [
    {
      label: "Documents",
      value: documents.length.toLocaleString(),
      detail: "stored in your library",
      icon: Files,
      color: "text-muted-strong",
      tile: "bg-surface-2",
    },
    {
      label: "Search-ready",
      value: indexedCount.toLocaleString(),
      detail: "indexed for grounded answers",
      icon: CheckCircle2,
      color: "text-success",
      tile: "bg-success/[0.09]",
    },
    {
      label: "Pages processed",
      value: processedPages.toLocaleString(),
      detail: "across your uploaded files",
      icon: Layers3,
      color: "text-muted-strong",
      tile: "bg-surface-2",
    },
    {
      label: "Needs attention",
      value: needsAttentionCount.toLocaleString(),
      detail: needsAttentionCount === 1 ? "document to review" : "documents to review",
      icon: Clock3,
      color: "text-muted-strong",
      tile: "bg-surface-2",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-6 sm:px-6 lg:px-9 lg:pt-9">
      <header className="mb-7 flex flex-col justify-between gap-5 xl:mb-9 xl:flex-row xl:items-end">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-strong">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-strong" />
            Your private knowledge base
          </div>
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-[42px] lg:text-[48px]">
            Your knowledge, in focus.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted-strong sm:text-sm">
            Bring your documents together, make them searchable, and get answers
            grounded in the sources you trust.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/agent"
            className="button-primary focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold"
          >
            <Sparkles size={15} />
            Open AI workspace
            <ArrowUpRight size={14} className="ml-1 opacity-75" />
          </Link>
          <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-[11px] text-muted">
            <ShieldCheck size={14} className="text-muted-strong" />
            Private to your account
          </span>
        </div>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Library statistics">
        {stats.map(({ label, value, detail, icon: Icon, color, tile }) => (
          <article
            key={label}
            className="surface-card group rounded-2xl p-4 transition duration-200 hover:border-border-strong sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-muted-strong">{label}</p>
                <p className="mt-2 text-[27px] font-semibold leading-none tracking-[-0.04em] text-foreground">
                  {loading ? <span className="skeleton inline-block h-7 w-12 rounded-md" /> : value}
                </p>
              </div>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tile} ${color}`}>
                <Icon size={17} strokeWidth={1.8} />
              </span>
            </div>
            <p className="mt-3 text-[10px] text-muted">{detail}</p>
          </article>
        ))}
      </section>

      <div className="mb-9 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <section
          aria-label="Upload documents"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`group relative isolate min-h-[230px] overflow-hidden rounded-[24px] border transition duration-200 ${
            dragOver
              ? "border-border-strong bg-surface-2 ring-4 ring-white/[0.06]"
              : "border-border bg-surface hover:border-border-strong"
          }`}
        >
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              const file = inputRef.current?.files?.[0];
              if (file) void handleUpload(file);
            }}
            className="relative flex min-h-[230px] flex-col justify-between gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:p-8"
          >
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border-strong bg-surface-2 text-muted-strong sm:h-14 sm:w-14">
                <Upload size={22} strokeWidth={1.7} />
              </div>
              <div className="max-w-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-strong">
                  Add to your library
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-[23px]">
                  Drop a document to get started
                </h2>
                <p className="mt-2 max-w-lg text-[12px] leading-5 text-muted-strong sm:text-[13px]">
                  Upload a PDF or image. Cognivault extracts the text, indexes
                  the content, and prepares it for grounded answers.
                </p>
                {uploading && (
                  <div className="mt-4 max-w-md">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/30">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-muted-strong">
                      {progress < 100
                        ? `Uploading… ${progress}%`
                        : "Extracting, embedding, and indexing…"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleUpload(file);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="button-primary focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto lg:w-full"
              >
                <Upload size={15} />
                {uploading ? "Working…" : "Choose a file"}
              </button>
              <p className="text-[10px] text-muted">
                PDF, JPG, PNG <span className="px-1 text-muted">·</span> 10 MB max
              </p>
            </div>
          </form>
        </section>

        <section className="surface-card rounded-[24px] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted">
                Continue exploring
              </p>
              <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-foreground">
                Quick actions
              </h2>
            </div>
            <Sparkles size={16} className="text-muted-strong" />
          </div>

          <div className="space-y-2.5">
            <Link
              href="/agent"
              className="group flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3.5 transition hover:border-border-strong hover:bg-surface-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface text-muted-strong">
                <Sparkles size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-foreground">
                  Ask your documents
                </span>
                <span className="mt-1 block text-[10px] text-muted-strong">
                  Get answers with source passages
                </span>
              </span>
              <ArrowRight size={15} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>

            <Link
              href="/research"
              className="group flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3.5 transition hover:border-border-strong hover:bg-white/[0.04]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface text-muted-strong">
                <Files size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-foreground">
                  Research across files
                </span>
                <span className="mt-1 block text-[10px] text-muted-strong">
                  Compare facts across indexed sources
                </span>
              </span>
              <ArrowRight size={15} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[10px] text-muted">
            <ShieldCheck size={13} className="text-muted-strong" />
            Answers stay scoped to documents you own.
          </p>
        </section>
      </div>

      <section aria-labelledby="library-heading">
        <div className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Your collection
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="library-heading" className="text-[21px] font-semibold tracking-[-0.03em] text-foreground">
                Document library
              </h2>
              <span className="text-[11px] text-muted">
                {loading ? "Updating…" : `${documents.length} ${documents.length === 1 ? "document" : "documents"}`}
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <label className="relative min-w-0 flex-1 md:w-[250px]">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your files"
                aria-label="Search documents by filename"
                className="control-input focus-ring h-10 w-full rounded-xl pl-10 pr-3 text-[12px]"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by processing status"
              className="control-input focus-ring h-10 rounded-xl px-3 text-[12px] text-muted-strong"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="needs_review">Needs review</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-[72px] rounded-xl" />
            ))}
          </div>
        ) : documents.length === 0 && (query || statusFilter) ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-10 text-center">
            <Search size={20} className="mx-auto text-muted-strong" />
            <p className="mt-3 text-sm font-medium text-foreground">
              No documents match these filters
            </p>
            <p className="mt-1 text-[11px] text-muted-strong">
              Try another filename or processing status.
            </p>
          </div>
        ) : documents.length === 0 ? (
          <div className="relative overflow-hidden rounded-[24px] border border-dashed border-white/[0.1] bg-white/[0.018] px-5 py-12 text-center sm:py-16">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong bg-surface-2 text-muted-strong">
              <FileText size={24} strokeWidth={1.6} />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              Your library is ready for its first document
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-muted-strong">
              Add a PDF or image to extract its text and make it available to
              document search and the AI workspace.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="button-secondary focus-ring mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-[11px] font-semibold"
            >
              <Upload size={14} />
              Upload a document
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-border bg-surface">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(100px,0.8fr)_minmax(150px,1.2fr)_70px_120px] items-center gap-4 border-b border-border bg-surface px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted lg:grid">
              <span>Document</span>
              <span>Type</span>
              <span>Processing</span>
              <span>Pages</span>
              <span className="text-right">Actions</span>
            </div>
            {documents.map((document) => (
              <article
                key={document.id}
                className="group grid gap-3 border-b border-white/[0.055] px-4 py-4 transition-colors last:border-b-0 hover:bg-white/[0.025] sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(100px,0.8fr)_minmax(150px,1.2fr)_70px_120px] lg:items-center lg:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-muted-strong">
                    {/\.jpe?g$|\.png$/i.test(document.filename) ? (
                      <FileImage size={18} strokeWidth={1.7} />
                    ) : (
                      <FileText size={18} strokeWidth={1.7} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h3
                      className="truncate text-[12px] font-semibold text-foreground sm:text-[13px]"
                      title={document.filename}
                    >
                      {document.filename}
                    </h3>
                    <p className="mt-1 truncate text-[10px] text-muted">
                      Added {formatDate(document.created_at)}
                      {document.extraction_method
                        ? ` · ${document.extraction_method}`
                        : ""}
                    </p>
                  </div>
                </div>

                <div className="hidden min-w-0 lg:block">
                  <span className="inline-flex max-w-full truncate rounded-lg border border-border bg-background px-2 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-strong">
                    {document.document_type ?? "unknown"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 lg:min-w-0">
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-medium ${badgeClass(document.status)}`}>
                    {document.status.replaceAll("_", " ")}
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-medium ${badgeClass(document.index_status)}`}>
                    {document.index_status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-strong lg:block">
                  <span className="lg:hidden">Pages</span>
                  <span className="font-medium text-foreground">
                    {document.page_count ?? "—"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => void openText(document)}
                    className="button-secondary focus-ring rounded-lg px-2.5 py-1.5 text-[10px] font-medium"
                  >
                    View text
                  </button>
                  <button
                    type="button"
                    onClick={() => void openAnalysis(document)}
                    className="focus-ring rounded-lg border border-transparent px-2.5 py-1.5 text-[10px] font-medium text-muted-strong transition hover:border-border hover:bg-surface-2 hover:text-foreground"
                  >
                    Analysis
                  </button>
                  <button
                    type="button"
                    disabled={busyId === document.id}
                    onClick={() => void reindex(document)}
                    aria-label={`${busyId === document.id ? "Indexing" : "Reindex"} ${document.filename}`}
                    title={busyId === document.id ? "Indexing" : "Reindex document"}
                    className="icon-button focus-ring ml-auto h-8 w-8 rounded-lg disabled:opacity-40"
                  >
                    <RotateCw size={14} className={busyId === document.id ? "animate-spin" : ""} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(document)}
                    aria-label={`Delete ${document.filename}`}
                    title="Delete document"
                    className="icon-button focus-ring h-8 w-8 rounded-lg text-muted hover:border-border-strong hover:bg-surface-2 hover:text-foreground"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {detailLoading && (
        <div className="fixed bottom-6 right-6 rounded-lg border border-border bg-surface px-4 py-2 text-xs text-muted">
          Loading…
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close details"
            className="absolute inset-0"
            onClick={() => setDetail(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Document details"
            className="animate-fade-up relative h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-strong">
                  {detail.kind === "text" ? "Extracted text" : "Analysis"}
                </p>
                <h2 className="mt-1 break-all text-lg font-medium">
                  {detail.data.filename}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Close"
                className="focus-ring rounded-lg border border-border-strong p-2 text-muted"
              >
                <X size={16} />
              </button>
            </div>

            {detail.kind === "text" ? (
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-border bg-surface p-4 font-sans text-sm leading-7 text-muted-strong">
                {detail.data.extracted_text ||
                  "No text available. Manual review may be needed."}
              </pre>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] text-muted">Type</p>
                    <p className="mt-1">{detail.data.document_type ?? "n/a"}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] text-muted">Method</p>
                    <p className="mt-1">{detail.data.extraction_method ?? "n/a"}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] text-muted">Review</p>
                    <p className="mt-1">{detail.data.review_status}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] text-muted">Index</p>
                    <p className="mt-1">{detail.data.index_status}</p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium">
                    Candidate fields
                  </h3>
                  <pre className="overflow-auto rounded-xl border border-border bg-surface p-4 text-xs text-muted-strong">
                    {JSON.stringify(detail.data.extracted_fields, null, 2)}
                  </pre>
                </div>

                <p className="rounded-xl border border-border bg-surface-2 p-3 text-xs leading-6 text-muted-strong">
                  These fields are machine-extracted candidates. They have not
                  been verified for accuracy and do not prove document
                  authenticity.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="animate-fade-up w-full max-w-md rounded-2xl border border-border bg-surface p-6"
          >
            <h2 id="delete-title" className="text-lg font-medium">
              Delete document?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-strong">
              <span className="break-all text-foreground">
                {confirming.filename}
              </span>{" "}
              and its indexed chunks will be permanently removed. This cannot
              be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="focus-ring rounded-lg border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === confirming.id}
                onClick={() => void remove(confirming)}
                className="focus-ring rounded-lg border border-border-strong bg-surface-2 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-3 disabled:opacity-50"
              >
                {busyId === confirming.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

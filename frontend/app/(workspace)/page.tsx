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
    return "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200";
  }
  if (value.includes("fail") || value.includes("needs")) {
    return "border-amber-300/20 bg-amber-300/[0.08] text-amber-100";
  }
  return "border-white/[0.08] bg-white/[0.035] text-[#a6a7b4]";
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
      color: "text-[#b6aaff]",
      tile: "bg-[#8d7aff]/[0.12]",
    },
    {
      label: "Search-ready",
      value: indexedCount.toLocaleString(),
      detail: "indexed for grounded answers",
      icon: CheckCircle2,
      color: "text-emerald-200",
      tile: "bg-emerald-400/[0.09]",
    },
    {
      label: "Pages processed",
      value: processedPages.toLocaleString(),
      detail: "across your uploaded files",
      icon: Layers3,
      color: "text-sky-200",
      tile: "bg-sky-400/[0.09]",
    },
    {
      label: "Needs attention",
      value: needsAttentionCount.toLocaleString(),
      detail: needsAttentionCount === 1 ? "document to review" : "documents to review",
      icon: Clock3,
      color: needsAttentionCount > 0 ? "text-amber-200" : "text-[#b6aaff]",
      tile: needsAttentionCount > 0 ? "bg-amber-300/[0.09]" : "bg-[#8d7aff]/[0.12]",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-6 sm:px-6 lg:px-9 lg:pt-9">
      <header className="mb-7 flex flex-col justify-between gap-5 xl:mb-9 xl:flex-row xl:items-end">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#7770bd]/20 bg-[#766bd1]/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#c2b8ff]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9d8cff] shadow-[0_0_12px_rgba(157,140,255,0.8)]" />
            Your private knowledge base
          </div>
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.045em] text-[#f3f1fa] sm:text-[42px] lg:text-[48px]">
            Your knowledge, <span className="text-[#a89cff]">in focus.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#a0a1ad] sm:text-sm">
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
          <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 text-[11px] text-[#9a9ba7]">
            <ShieldCheck size={14} className="text-emerald-300" />
            Private to your account
          </span>
        </div>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Library statistics">
        {stats.map(({ label, value, detail, icon: Icon, color, tile }) => (
          <article
            key={label}
            className="group rounded-2xl border border-white/[0.07] bg-[linear-gradient(150deg,rgba(24,25,35,0.95),rgba(15,16,23,0.96))] p-4 shadow-[0_14px_42px_-34px_rgba(0,0,0,0.9)] transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.12] sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-[#9b9ca8]">{label}</p>
                <p className="mt-2 text-[27px] font-semibold leading-none tracking-[-0.04em] text-[#f2f0f8]">
                  {loading ? <span className="skeleton inline-block h-7 w-12 rounded-md" /> : value}
                </p>
              </div>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tile} ${color}`}>
                <Icon size={17} strokeWidth={1.8} />
              </span>
            </div>
            <p className="mt-3 text-[10px] text-[#71727f]">{detail}</p>
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
              ? "border-[#b4a8ff]/60 bg-[#5b4cb5]/[0.13] shadow-[0_0_0_4px_rgba(129,111,255,0.1)]"
              : "border-[#8177c6]/20 bg-[linear-gradient(120deg,rgba(37,33,63,0.72),rgba(19,20,29,0.96)_62%)] hover:border-[#8177c6]/35"
          }`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-32 -z-10 h-[360px] w-[360px] rounded-full bg-[#7367e8]/[0.12] blur-[100px] transition duration-500 group-hover:bg-[#7367e8]/[0.2]"
          />
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              const file = inputRef.current?.files?.[0];
              if (file) void handleUpload(file);
            }}
            className="relative flex min-h-[230px] flex-col justify-between gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:p-8"
          >
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#b3a6ff]/20 bg-[#8071e7]/[0.12] text-[#c8beff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-14 sm:w-14">
                <Upload size={22} strokeWidth={1.7} />
              </div>
              <div className="max-w-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b2a8ef]">
                  Add to your library
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#f0eef8] sm:text-[23px]">
                  Drop a document to get started
                </h2>
                <p className="mt-2 max-w-lg text-[12px] leading-5 text-[#9a9ba9] sm:text-[13px]">
                  Upload a PDF or image. Cognivault extracts the text, indexes
                  the content, and prepares it for grounded answers.
                </p>
                {uploading && (
                  <div className="mt-4 max-w-md">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/30">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#9e8dff] to-[#6961ed] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-[#b4b1c8]">
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
              <p className="text-[10px] text-[#797986]">
                PDF, JPG, PNG <span className="px-1 text-[#454550]">·</span> 10 MB max
              </p>
            </div>
          </form>
        </section>

        <section className="rounded-[24px] border border-white/[0.07] bg-[linear-gradient(155deg,rgba(22,23,32,0.96),rgba(14,15,21,0.98))] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#777985]">
                Continue exploring
              </p>
              <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-[#eeedf5]">
                Quick actions
              </h2>
            </div>
            <Sparkles size={16} className="text-[#a99cff]" />
          </div>

          <div className="space-y-2.5">
            <Link
              href="/agent"
              className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5 transition hover:border-[#8f82e8]/25 hover:bg-[#7b6cdb]/[0.07]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#9586ff]/15 bg-[#796bdb]/[0.12] text-[#beb4ff]">
                <Sparkles size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[#e9e7f1]">
                  Ask your documents
                </span>
                <span className="mt-1 block text-[10px] text-[#81828e]">
                  Get answers with source passages
                </span>
              </span>
              <ArrowRight size={15} className="text-[#71727f] transition group-hover:translate-x-0.5 group-hover:text-[#c0b6ff]" />
            </Link>

            <Link
              href="/research"
              className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5 transition hover:border-[#73a4bd]/20 hover:bg-sky-300/[0.045]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200/10 bg-sky-300/[0.08] text-sky-200">
                <Files size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[#e9e7f1]">
                  Research across files
                </span>
                <span className="mt-1 block text-[10px] text-[#81828e]">
                  Compare facts across indexed sources
                </span>
              </span>
              <ArrowRight size={15} className="text-[#71727f] transition group-hover:translate-x-0.5 group-hover:text-sky-200" />
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[10px] text-[#777985]">
            <ShieldCheck size={13} className="text-emerald-300/80" />
            Answers stay scoped to documents you own.
          </p>
        </section>
      </div>

      <section aria-labelledby="library-heading">
        <div className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777985]">
              Your collection
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="library-heading" className="text-[21px] font-semibold tracking-[-0.03em] text-[#f0eef6]">
                Document library
              </h2>
              <span className="text-[11px] text-[#777985]">
                {loading ? "Updating…" : `${documents.length} ${documents.length === 1 ? "document" : "documents"}`}
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <label className="relative min-w-0 flex-1 md:w-[250px]">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#70717e]"
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
              className="control-input focus-ring h-10 rounded-xl px-3 text-[12px] text-[#d0cfda]"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="needs_review">Needs review</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-52 rounded-2xl" />
            ))}
          </div>
        ) : documents.length === 0 && (query || statusFilter) ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-10 text-center">
            <Search size={20} className="mx-auto text-[#82818f]" />
            <p className="mt-3 text-sm font-medium text-[#dedce7]">
              No documents match these filters
            </p>
            <p className="mt-1 text-[11px] text-[#81828e]">
              Try another filename or processing status.
            </p>
          </div>
        ) : documents.length === 0 ? (
          <div className="relative overflow-hidden rounded-[24px] border border-dashed border-white/[0.1] bg-white/[0.018] px-5 py-12 text-center sm:py-16">
            <div className="absolute inset-x-1/3 top-0 h-px bg-gradient-to-r from-transparent via-[#a89bff]/40 to-transparent" />
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#9586ff]/15 bg-[#796bdb]/[0.09] text-[#b9adff]">
              <FileText size={24} strokeWidth={1.6} />
            </span>
            <h3 className="mt-4 text-base font-semibold text-[#eceaf4]">
              Your library is ready for its first document
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-[#858691]">
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
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {documents.map((document) => (
              <article
                key={document.id}
                className="group flex min-h-[210px] flex-col rounded-[20px] border border-white/[0.07] bg-[linear-gradient(145deg,rgba(22,23,31,0.96),rgba(14,15,21,0.98))] p-4 shadow-[0_14px_42px_-36px_rgba(0,0,0,0.9)] transition duration-200 hover:-translate-y-0.5 hover:border-[#9588e8]/25 hover:shadow-[0_20px_48px_-34px_rgba(93,77,201,0.28)] sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#9a8cff]/15 bg-[#8071e7]/[0.09] text-[#b7abff]">
                    <FileText size={18} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h3
                      className="truncate text-[13px] font-semibold text-[#e9e7f0]"
                      title={document.filename}
                    >
                      {document.filename}
                    </h3>
                    <p className="mt-1 text-[10px] text-[#777985]">
                      {formatDate(document.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-white/[0.07] bg-black/15 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[#a5a4b0]">
                    {document.document_type ?? "unknown"}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-medium ${badgeClass(document.status)}`}>
                    {document.status.replaceAll("_", " ")}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-medium ${badgeClass(document.index_status)}`}>
                    {document.index_status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.055] pt-3.5 text-[10px]">
                  <div>
                    <p className="text-[#686a76]">Pages</p>
                    <p className="mt-1 font-medium text-[#c4c2ce]">
                      {document.page_count ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#686a76]">Extraction</p>
                    <p className="mt-1 truncate font-medium capitalize text-[#c4c2ce]">
                      {document.extraction_method ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
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
                    className="focus-ring rounded-lg border border-transparent px-2.5 py-1.5 text-[10px] font-medium text-[#92929f] transition hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white"
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
                    className="icon-button focus-ring h-8 w-8 rounded-lg text-[#82838f] hover:border-red-400/20 hover:bg-red-400/[0.08] hover:text-red-200"
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
        <div className="fixed bottom-6 right-6 rounded-lg border border-[#2a3142] bg-[#0b0e17] px-4 py-2 text-xs text-[#9aa3b8]">
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
            className="animate-fade-up relative h-full w-full max-w-2xl overflow-y-auto border-l border-[#1e2433] bg-[#080a11] p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-indigo-400">
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
                className="focus-ring rounded-lg border border-[#2a3142] p-2 text-[#9aa3b8]"
              >
                <X size={16} />
              </button>
            </div>

            {detail.kind === "text" ? (
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-[#1e2433] bg-[#0b0e17] p-4 font-sans text-sm leading-7 text-[#c7cddd]">
                {detail.data.extracted_text ||
                  "No text available. Manual review may be needed."}
              </pre>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-[#1e2433] bg-[#0b0e17] p-3">
                    <p className="text-[11px] text-[#6f7890]">Type</p>
                    <p className="mt-1">{detail.data.document_type ?? "n/a"}</p>
                  </div>
                  <div className="rounded-xl border border-[#1e2433] bg-[#0b0e17] p-3">
                    <p className="text-[11px] text-[#6f7890]">Method</p>
                    <p className="mt-1">{detail.data.extraction_method ?? "n/a"}</p>
                  </div>
                  <div className="rounded-xl border border-[#1e2433] bg-[#0b0e17] p-3">
                    <p className="text-[11px] text-[#6f7890]">Review</p>
                    <p className="mt-1">{detail.data.review_status}</p>
                  </div>
                  <div className="rounded-xl border border-[#1e2433] bg-[#0b0e17] p-3">
                    <p className="text-[11px] text-[#6f7890]">Index</p>
                    <p className="mt-1">{detail.data.index_status}</p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium">
                    Candidate fields
                  </h3>
                  <pre className="overflow-auto rounded-xl border border-[#1e2433] bg-[#0b0e17] p-4 text-xs text-[#c7cddd]">
                    {JSON.stringify(detail.data.extracted_fields, null, 2)}
                  </pre>
                </div>

                <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-6 text-amber-200/90">
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
            className="animate-fade-up w-full max-w-md rounded-2xl border border-[#1e2433] bg-[#0b0e17] p-6"
          >
            <h2 id="delete-title" className="text-lg font-medium">
              Delete document?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#8b93a7]">
              <span className="break-all text-[#c7cddd]">
                {confirming.filename}
              </span>{" "}
              and its indexed chunks will be permanently removed. This cannot
              be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="focus-ring rounded-lg border border-[#2a3142] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === confirming.id}
                onClick={() => void remove(confirming)}
                className="focus-ring rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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

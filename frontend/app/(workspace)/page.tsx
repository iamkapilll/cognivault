"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DragEvent, FormEvent } from "react";

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
import {
  DocumentIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";

const MAX_SIZE = 10 * 1024 * 1024;
const EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function badgeClass(value: string): string {
  if (value.includes("indexed")) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (value.includes("fail") || value.includes("needs")) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-[#2a3142] bg-[#141926] text-[#9aa3b8]";
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

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-indigo-400">
            Library
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Documents
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#8b93a7]">
            Upload material, extract text with native parsing or OCR, and index
            it for grounded AI answers.
          </p>
        </div>

        <div className="rounded-xl border border-[#1e2433] bg-[#0b0e17] px-4 py-3 text-right">
          <p className="text-2xl font-semibold">{documents.length}</p>
          <p className="text-[11px] uppercase tracking-wider text-[#6f7890]">
            documents
          </p>
        </div>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mb-8 rounded-2xl border border-dashed p-6 transition md:p-8 ${
          dragOver
            ? "border-indigo-400 bg-indigo-500/10"
            : "border-[#2a3142] bg-[#0b0e17]/70"
        }`}
      >
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            const file = inputRef.current?.files?.[0];
            if (file) void handleUpload(file);
          }}
          className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#161b29] text-indigo-300">
            <DocumentIcon width={22} height={22} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Drop a PDF or image here, or choose a file
            </p>
            <p className="mt-1 text-xs text-[#6f7890]">
              PDF, JPG, JPEG, PNG · up to 10 MB · PDFs up to 20 pages · OCR
              results are candidates, not verified facts
            </p>

            {uploading && (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1a2030]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#8b93a7]">
                  {progress < 100
                    ? `Uploading… ${progress}%`
                    : "Extracting, embedding, and indexing…"}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
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
              className="focus-ring rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {uploading ? "Working…" : "Choose file"}
            </button>
          </div>
        </form>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon
            width={16}
            height={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5d6577]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by filename…"
            aria-label="Search documents by filename"
            className="focus-ring w-full rounded-xl border border-[#1e2433] bg-[#0b0e17] py-2.5 pl-9 pr-3 text-sm placeholder:text-[#5d6577]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by processing status"
          className="focus-ring rounded-xl border border-[#1e2433] bg-[#0b0e17] px-3 py-2.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="needs_review">Needs review</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-2xl border border-[#1e2433] bg-[#0b0e17] p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#161b29] text-[#5d6577]">
            <DocumentIcon width={22} height={22} />
          </div>
          <h2 className="text-base font-medium">No documents yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#8b93a7]">
            Upload a PDF or image to extract text, review candidate fields, and
            make it available to the AI agent.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {documents.map((document) => (
            <article
              key={document.id}
              className="animate-fade-up flex flex-col rounded-2xl border border-[#1e2433] bg-[#0b0e17] p-5 transition hover:border-[#2c3448]"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    className="truncate text-sm font-medium"
                    title={document.filename}
                  >
                    {document.filename}
                  </h2>
                  <p className="mt-1 text-[11px] text-[#6f7890]">
                    #{document.id} · {formatDate(document.created_at)}
                  </p>
                </div>

                <span className="shrink-0 rounded-md border border-[#2a3142] bg-[#141926] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#9aa3b8]">
                  {document.document_type ?? "unknown"}
                </span>
              </div>

              <div className="mb-4 flex flex-wrap gap-1.5 text-[10px]">
                <span className={`rounded-md border px-2 py-0.5 ${badgeClass(document.status)}`}>
                  {document.status}
                </span>
                <span className={`rounded-md border px-2 py-0.5 ${badgeClass(document.index_status)}`}>
                  {document.index_status.replace("_", " ")}
                </span>
                <span className="rounded-md border border-[#2a3142] bg-[#141926] px-2 py-0.5 text-[#9aa3b8]">
                  {document.extraction_method ?? "n/a"}
                </span>
                <span className="rounded-md border border-[#2a3142] bg-[#141926] px-2 py-0.5 text-[#9aa3b8]">
                  {document.page_count ?? "?"} pages
                </span>
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openText(document)}
                  className="focus-ring rounded-lg border border-[#2a3142] px-3 py-1.5 text-xs text-[#c7cddd] transition hover:border-indigo-500/50 hover:text-white"
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => void openAnalysis(document)}
                  className="focus-ring rounded-lg border border-[#2a3142] px-3 py-1.5 text-xs text-[#c7cddd] transition hover:border-indigo-500/50 hover:text-white"
                >
                  Analysis
                </button>
                <button
                  type="button"
                  disabled={busyId === document.id}
                  onClick={() => void reindex(document)}
                  className="focus-ring rounded-lg border border-[#2a3142] px-3 py-1.5 text-xs text-[#c7cddd] transition hover:border-indigo-500/50 hover:text-white disabled:opacity-40"
                >
                  {busyId === document.id ? "Indexing…" : "Reindex"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(document)}
                  aria-label={`Delete ${document.filename}`}
                  className="focus-ring ml-auto rounded-lg border border-transparent p-1.5 text-[#5d6577] transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                >
                  <TrashIcon width={15} height={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

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
                <XIcon width={16} height={16} />
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

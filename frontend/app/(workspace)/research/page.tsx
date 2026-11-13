"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileSearch,
  FileText,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { MarkdownContent } from "@/components/MarkdownContent";
import { useToast } from "@/components/Toast";
import {
  askDocuments,
  getDocuments,
  type ApiDocument,
  type RagAnswer,
} from "@/lib/api";

export default function ResearchPage() {
  const { push } = useToast();

  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<RagAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    getDocuments()
      .then((items) => {
        setDocuments(items);
        setSelected(
          items.filter((item) => item.index_status === "indexed").map((item) => item.id),
        );
      })
      .catch((error) =>
        push(
          error instanceof Error ? error.message : "Could not load documents",
          "error",
        ),
      )
      .finally(() => setLoadingDocs(false));
  }, [push]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!question.trim()) return;

    try {
      setLoading(true);
      setResult(await askDocuments(question.trim(), selected));
    } catch (error) {
      push(error instanceof Error ? error.message : "Research failed", "error");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: number) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-6 sm:px-6 lg:px-9 lg:pt-8">
      <header className="mb-7 flex flex-col justify-between gap-5 border-b border-white/[0.065] pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
            <span>Knowledge base</span>
            <span className="text-muted">/</span>
            <span className="text-muted-strong">Grounded research</span>
          </div>
          <h1 className="flex items-center gap-3 text-[30px] font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-[36px]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-muted-strong">
              <Sparkles size={19} strokeWidth={1.7} />
            </span>
            Research across your files
          </h1>
          <p className="mt-2 max-w-2xl text-[12px] leading-6 text-muted-strong sm:text-[13px]">
            Ask a focused question, choose which indexed files to search, then
            inspect the passages behind the answer.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 sm:self-auto">
          <ShieldCheck size={15} className="text-muted-strong" />
          <span className="text-[10px] text-muted-strong">
            Evidence stays in view
          </span>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(285px,0.78fr)_minmax(0,1.7fr)]">
        <aside className="surface-card overflow-hidden rounded-2xl">
          <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-strong">
                  <BookOpen size={15} />
                </span>
                <div>
                  <h2 className="text-[12px] font-semibold text-foreground">
                    Document scope
                  </h2>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {loadingDocs
                      ? "Loading library…"
                      : `${documents.length} ${documents.length === 1 ? "file" : "files"} in your library`}
                  </p>
                </div>
              </div>
              <span className="rounded-md border border-border bg-surface px-2 py-1 text-[9px] text-muted-strong">
                {selected.length ? `${selected.length} selected` : "All indexed"}
              </span>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-muted-strong">
              {selected.length === 0
                ? "No filter selected. Search across every indexed document you own."
                : "Only the selected documents will be used for this answer."}
            </p>
          </div>

          <div className="max-h-[min(56vh,560px)] space-y-1 overflow-y-auto p-2.5">
            {loadingDocs ? (
              <div className="space-y-2 p-1">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="skeleton h-[58px] rounded-xl" />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="px-3 py-7 text-center">
                <FileSearch size={20} className="mx-auto text-muted" />
                <p className="mt-3 text-[11px] font-medium text-foreground">
                  No documents to search yet
                </p>
                <p className="mx-auto mt-1 max-w-[220px] text-[10px] leading-5 text-muted">
                  Add a file to your library and index it to make it searchable.
                </p>
                <Link
                  href="/"
                  className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] text-foreground hover:bg-surface-2"
                >
                  Open document library
                  <ArrowRight size={12} />
                </Link>
              </div>
            ) : (
              documents.map((document) => {
                const indexed = document.index_status === "indexed";
                const checked = selected.includes(document.id);
                return (
                  <label
                    key={document.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${
                      checked
                        ? "border-border-strong bg-surface-2"
                        : "border-transparent hover:border-border hover:bg-surface"
                    } ${!indexed ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!indexed}
                      onChange={() => toggle(document.id)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border ${
                        checked
                          ? "border-foreground bg-foreground text-background"
                          : "border-white/[0.14] bg-black/10 text-transparent"
                      }`}
                    >
                      {checked && <Check size={12} strokeWidth={2.2} />}
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-strong">
                      <FileText size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-foreground">
                        {document.filename}
                      </span>
                      <span className="mt-1 block text-[9px] text-muted">
                        {document.page_count ?? "—"} pages
                        {document.document_type
                          ? ` · ${document.document_type}`
                          : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-medium ${
                        indexed
                          ? "border-success/15 bg-success/[0.05] text-success"
                          : "border-border bg-surface text-muted-strong"
                      }`}
                    >
                      {indexed ? "Indexed" : document.index_status.replaceAll("_", " ")}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="border-t border-white/[0.06] px-4 py-3">
            <p className="flex items-center gap-2 text-[9px] leading-4 text-muted">
              <Search size={12} className="shrink-0 text-muted" />
              Only indexed documents can be selected.
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <form
            onSubmit={onSubmit}
            className="surface-card overflow-hidden rounded-[22px]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-strong">
                  <FileSearch size={15} />
                </span>
                <div>
                  <label
                    htmlFor="research-question"
                    className="block text-[12px] font-semibold text-foreground"
                  >
                    Ask your documents
                  </label>
                  <p className="mt-0.5 text-[9px] text-muted">
                    Retrieval-augmented answer with source passages
                  </p>
                </div>
              </div>
              <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-[9px] text-muted-strong sm:inline-flex">
                <ShieldCheck size={11} className="text-muted-strong" />
                Private to your account
              </span>
            </div>

            <div className="p-3.5 sm:p-5">
              <textarea
                id="research-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="What are the payment terms and deadlines in these documents?"
                className="focus-ring min-h-[130px] w-full resize-y rounded-xl border border-border bg-background p-4 text-[13px] leading-6 text-foreground placeholder:text-muted"
              />
              <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="flex items-center gap-2 text-[10px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-strong" />
                  Evidence-first answers · inspect every source
                </p>
                <button
                  type="submit"
                  disabled={loading || !question.trim()}
                  className="button-primary focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {loading ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Searching sources…
                    </>
                  ) : (
                    <>
                      Run research
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {loading && (
            <div role="status" aria-label="Researching documents" className="mt-5 space-y-3">
              <div className="skeleton h-36 rounded-2xl" />
              <div className="skeleton h-24 rounded-2xl" />
            </div>
          )}

          {!loading && !result && (
            <div className="mt-5 flex min-h-[210px] flex-col justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.012] px-5 py-7 sm:px-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-strong">
                <BookOpen size={18} />
              </span>
              <h2 className="mt-4 text-[13px] font-semibold text-foreground">
                The answer should come with its evidence
              </h2>
              <p className="mt-1.5 max-w-lg text-[11px] leading-5 text-muted-strong">
                Submit a question to retrieve matching passages from your selected
                documents. If no files are selected, the search uses all indexed files.
              </p>
            </div>
          )}

          {result && !loading && (
            <div className="mt-5 space-y-5">
              <article className="surface-card animate-fade-up rounded-2xl p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-strong">
                    <Sparkles size={14} />
                  </span>
                  <h2 className="text-[12px] font-semibold text-foreground">
                    Research answer
                  </h2>
                </div>
                <MarkdownContent content={result.answer} />
              </article>

              <section aria-labelledby="sources-heading">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted">
                      Evidence trail
                    </p>
                    <h2
                      id="sources-heading"
                      className="mt-1 text-[14px] font-semibold text-foreground"
                    >
                      Source passages
                    </h2>
                  </div>
                  <span className="rounded-md border border-border bg-surface px-2 py-1 text-[9px] text-muted-strong">
                    {result.sources.length}{" "}
                    {result.sources.length === 1 ? "source" : "sources"}
                  </span>
                </div>

                {result.sources.length === 0 ? (
                  <p className="rounded-xl border border-border bg-surface px-4 py-5 text-[11px] leading-5 text-muted-strong">
                    No source passages were returned for this question.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {result.sources.map((source, index) => (
                      <article
                        key={`${source.document_id}-${source.chunk_index}`}
                        className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[9px] font-medium text-muted-strong">
                            <span className="h-1 w-1 rounded-full bg-muted" />
                            Source {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-muted-strong">
                            {source.filename}
                          </span>
                          <span className="text-[9px] text-muted">
                            Passage {source.chunk_index}
                          </span>
                          <span className="rounded-full border border-border px-2 py-1 text-[8px] text-muted-strong">
                            {Math.round((1 - source.distance) * 100)}% match
                          </span>
                        </div>
                        <p className="border-l-2 border-border-strong pl-3 text-[11px] leading-6 text-muted-strong sm:text-[12px]">
                          {source.content}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

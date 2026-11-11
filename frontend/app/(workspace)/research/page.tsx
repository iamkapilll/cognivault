"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { useToast } from "@/components/Toast";
import {
  askDocuments,
  getDocuments,
  type ApiDocument,
  type RagAnswer,
} from "@/lib/api";
import { SparklesIcon } from "@/components/icons";

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
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-indigo-400">
          Retrieval
        </p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <SparklesIcon width={26} height={26} className="text-indigo-400" />
          AI Research
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b93a7]">
          Ask a focused question across selected indexed documents. Answers are
          grounded in retrieved passages and include their sources.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[#1e2433] bg-[#0b0e17] p-5">
          <h2 className="text-sm font-medium">Document scope</h2>
          <p className="mt-1 text-[11px] text-[#6f7890]">
            {selected.length === 0
              ? "No filter: searches every indexed document you own."
              : `${selected.length} selected`}
          </p>

          <div className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
            {loadingDocs ? (
              <div className="space-y-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="skeleton h-9 rounded-lg" />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <p className="text-xs leading-5 text-[#5d6577]">
                Upload documents first.
              </p>
            ) : (
              documents.map((document) => (
                <label
                  key={document.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-xs text-[#c7cddd] hover:bg-[#11151f]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(document.id)}
                    onChange={() => toggle(document.id)}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {document.filename}
                  </span>
                  <span className="text-[10px] text-[#5d6577]">
                    {document.index_status === "indexed" ? "indexed" : "raw"}
                  </span>
                </label>
              ))
            )}
          </div>
        </section>

        <section>
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-[#1e2433] bg-[#0b0e17] p-5"
          >
            <label htmlFor="research-question" className="text-sm font-medium">
              Research question
            </label>
            <textarea
              id="research-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="What are the payment terms and deadlines in these documents?"
              className="focus-ring mt-2 w-full resize-y rounded-xl border border-[#1e2433] bg-[#080a11] p-3 text-sm leading-6 placeholder:text-[#5d6577]"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[10px] text-[#5d6577]">
                Evidence-only answers · citations included
              </p>
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="focus-ring rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? "Researching…" : "Run research"}
              </button>
            </div>
          </form>

          {loading && (
            <div className="mt-6 space-y-3">
              <div className="skeleton h-28 rounded-2xl" />
              <div className="skeleton h-20 rounded-2xl" />
            </div>
          )}

          {result && !loading && (
            <div className="mt-6 space-y-5">
              <article className="animate-fade-up rounded-2xl border border-[#1e2433] bg-[#0b0e17] p-5">
                <h2 className="mb-3 text-sm font-medium text-indigo-300">
                  Answer
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-[#d5dae6]">
                  {result.answer}
                </p>
              </article>

              <div>
                <h2 className="mb-2 text-sm font-medium">
                  Sources ({result.sources.length})
                </h2>

                <div className="space-y-3">
                  {result.sources.map((source, index) => (
                    <div
                      key={`${source.document_id}-${source.chunk_index}`}
                      className="rounded-xl border border-[#1e2433] bg-[#0b0e17] p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-indigo-300">
                          Source {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[#8b93a7]">
                          {source.filename} · chunk {source.chunk_index}
                        </span>
                        <span className="text-[#5d6577]">
                          relevance {Math.round((1 - source.distance) * 100)}%
                        </span>
                      </div>

                      <p className="whitespace-pre-wrap text-xs leading-6 text-[#9aa3b8]">
                        {source.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

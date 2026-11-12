"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { useToast } from "@/components/Toast";

type MarkdownBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; depth: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; language: string; source: string };

const INLINE_PATTERN =
  /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|`[^`\n]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

function startsMarkdownBlock(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^#{1,4}\s/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line)
  );
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) index += 1;
      blocks.push({
        kind: "code",
        language: fence[1] || "code",
        source: codeLines.join("\n"),
      });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        depth: heading[1].length,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];

      while (index < lines.length) {
        const item = lines[index].match(
          isOrdered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/,
        );
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }

      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsMarkdownBlock(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_PATTERN).map((part, index) => {
    if (!part) return null;

    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return (
        <a
          key={index}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-[#c2b8ff] underline decoration-[#8d81dc]/50 underline-offset-4 hover:text-white"
        >
          {link[1]}
        </a>
      );
    }
    if (part.startsWith("`")) {
      return (
        <code
          key={index}
          className="rounded-md border border-white/[0.07] bg-black/25 px-1.5 py-0.5 font-mono text-[0.88em] text-[#ded9ff]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return (
        <strong key={index} className="font-semibold text-[#f4f2fb]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <span key={index}>{part}</span>;
  });
}

function CopyableCode({
  language,
  source,
}: {
  language: string;
  source: string;
}) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      push(
        error instanceof Error ? error.message : "Could not copy code.",
        "error",
      );
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#090b10]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.025] px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#777a89]">
          {language}
        </span>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="focus-ring inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-[10px] text-[#9c9eac] transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12px] leading-6 text-[#d3d5df]">
        <code>{source}</code>
      </pre>
    </div>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="space-y-3 break-words text-[13px] leading-7 text-[#c8cad5]">
      {parseMarkdown(content).map((block, index) => {
        if (block.kind === "code") {
          return (
            <CopyableCode
              key={index}
              language={block.language}
              source={block.source}
            />
          );
        }
        if (block.kind === "heading") {
          const Heading = block.depth <= 2 ? "h3" : "h4";
          return (
            <Heading
              key={index}
              className="pt-1 text-[14px] font-semibold tracking-[-0.01em] text-[#f0eef8]"
            >
              {renderInline(block.text)}
            </Heading>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={index}
              className={`space-y-1.5 pl-5 ${
                block.ordered ? "list-decimal" : "list-disc"
              }`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1">
                  {renderInline(item)}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

import type { ReactNode } from "react";
import { FileText, Search, ShieldCheck, Sparkles } from "lucide-react";

import AuthVisual from "@/components/auth/AuthVisual";
import BrandMark from "@/components/auth/BrandMark";

const CAPABILITIES = [
  {
    icon: FileText,
    title: "Document intelligence",
    detail: "Extract text and review candidate fields.",
  },
  {
    icon: Search,
    title: "Grounded answers",
    detail: "Follow each answer back to its source passage.",
  },
  {
    icon: Sparkles,
    title: "Research workflows",
    detail: "Compare files and explore questions in context.",
  },
];

type AuthLayoutProps = {
  heading: string;
  subheading: string;
  children: ReactNode;
  footer: ReactNode;
};

export default function AuthLayout({
  heading,
  subheading,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <main className="auth-canvas relative min-h-dvh overflow-hidden text-foreground">
      <a
        href="#auth-form"
        className="sr-only rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to form
      </a>

      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1680px] sm:grid-cols-[minmax(0,1fr)_minmax(350px,1fr)] lg:grid-cols-[minmax(0,1.12fr)_minmax(430px,0.88fr)]">
        <aside className="auth-brand-panel relative hidden min-h-dvh overflow-hidden border-r border-border px-6 py-7 sm:flex sm:flex-col sm:justify-between md:px-8 lg:px-11 lg:py-9 xl:px-16 xl:py-11">
          <div className="relative z-10 flex items-center gap-3">
            <BrandMark size={42} />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                Cognivault <span className="font-medium text-muted-strong">AI</span>
              </p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted">
                Private intelligence workspace
              </p>
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[620px] py-10 lg:py-4">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.17em] text-muted-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Built around your sources
            </p>

            <h1 className="text-[30px] font-semibold leading-[1.04] tracking-[-0.045em] text-foreground md:text-[38px] xl:text-[54px]">
              Find the facts
              <br />
              <span className="text-muted-strong">
                inside your files.
              </span>
            </h1>

            <p className="mt-5 max-w-[490px] text-[12px] leading-6 text-muted-strong md:text-[13px] xl:text-[14px]">
              Turn documents into a private, searchable knowledge base. Ask
              focused questions and inspect the evidence behind each answer.
            </p>

            <AuthVisual />

            <ul className="mt-6 space-y-2.5">
              {CAPABILITIES.map(({ icon: Icon, title, detail }) => (
                <li
                  key={title}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 transition duration-200 hover:border-border-strong hover:bg-surface-3 sm:px-3.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-strong">
                    <Icon size={15} strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-foreground sm:text-[12px]">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[9px] leading-4 text-muted-strong sm:text-[10px]">
                      {detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-[9px] text-muted sm:text-[10px]">
            <ShieldCheck size={13} className="shrink-0 text-muted-strong" />
            Private workspaces <span className="text-muted">·</span> Source-grounded answers
          </div>
        </aside>

        <section
          id="auth-form"
          className="relative flex min-h-dvh scroll-mt-8 flex-col items-center justify-center px-5 py-9 sm:px-6 md:px-8 lg:px-10 xl:px-16"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          </div>

          <div className="relative z-10 mb-9 flex w-full max-w-[430px] items-center justify-between sm:hidden">
            <div className="flex items-center gap-2.5">
              <BrandMark size={36} />
              <span className="text-[13px] font-semibold tracking-[-0.02em] text-foreground">
                Cognivault <span className="font-medium text-muted-strong">AI</span>
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[9px] text-muted-strong">
              <ShieldCheck size={12} className="text-muted-strong" />
              Secure access
            </span>
          </div>

          <div className="auth-rise relative z-10 w-full max-w-[430px]">
            <div className="mb-6 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.17em] text-muted-strong">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-strong">
                <ShieldCheck size={13} />
              </span>
              Secure workspace access
            </div>

            <div className="mb-6">
              <h2 className="text-[29px] font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-[32px]">
                {heading}
              </h2>
              <p className="mt-2.5 max-w-[380px] text-[12px] leading-6 text-muted-strong sm:text-[13px]">
                {subheading}
              </p>
            </div>

            <div className="auth-form-card relative overflow-hidden rounded-[22px] p-5 shadow-[var(--shadow-panel)] sm:p-7">
              {children}
            </div>

            <div className="mt-6">{footer}</div>
          </div>

          <p className="relative z-10 mt-9 text-center text-[9px] tracking-[0.04em] text-muted">
            Your files remain private to your account.
          </p>
        </section>
      </div>
    </main>
  );
}

import type { ReactNode } from "react";

import AuthVisual from "@/components/auth/AuthVisual";
import BrandMark from "@/components/auth/BrandMark";
import {
  CompassIcon,
  DocumentIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/icons";

const CAPABILITIES = [
  {
    icon: DocumentIcon,
    title: "Document intelligence",
    detail: "Native parsing and OCR turn raw files into structured knowledge.",
  },
  {
    icon: SearchIcon,
    title: "Grounded retrieval",
    detail: "Answers cite the passages they were built from, not guesses.",
  },
  {
    icon: CompassIcon,
    title: "Research agents",
    detail: "Multi-step tool use with approval before anything destructive.",
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
    <main className="auth-canvas relative min-h-dvh text-[#e7eaf3]">
      <a
        href="#auth-form"
        className="sr-only rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to form
      </a>

      <div className="mx-auto grid min-h-dvh w-full max-w-[1680px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        {/* Brand panel */}
        <aside className="relative hidden border-r border-white/[0.06] lg:flex lg:min-h-dvh lg:flex-col lg:justify-between lg:gap-6 lg:px-12 lg:py-8 xl:px-16 xl:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div className="absolute -left-28 -top-28 h-[460px] w-[460px] rounded-full bg-indigo-600/[0.18] blur-[130px]" />
            <div className="absolute -bottom-40 right-[-10%] h-[440px] w-[440px] rounded-full bg-sky-500/[0.09] blur-[140px]" />
            <div className="auth-grid absolute inset-0" />
            <div className="auth-vignette absolute inset-0" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>

          <div className="relative flex items-center gap-3">
            <BrandMark size={38} />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight text-white">
                Cognivault AI
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6f7a90]">
                Intelligence workspace
              </p>
            </div>
          </div>

          <div className="relative max-w-[560px] py-2">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-[#9aa3b8] uppercase">
              <span className="h-1 w-1 rounded-full bg-indigo-400" />
              Document intelligence platform
            </p>

            <h1 className="text-[2.25rem] font-semibold leading-[1.06] tracking-[-0.035em] text-white xl:text-[2.95rem]">
              Your documents,
              <br />
              <span className="bg-gradient-to-r from-indigo-200 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
                understood.
              </span>
            </h1>

            <p className="mt-5 max-w-[460px] text-[15px] leading-7 text-[#8b93a7]">
              Upload your files, extract what matters, and ask questions that are
              answered from your own sources — with an agent that researches and
              cites its work.
            </p>

            <AuthVisual />

            <ul className="mt-5 space-y-2">
              {CAPABILITIES.map(({ icon: Icon, title, detail }) => (
                <li
                  key={title}
                  className="flex items-start gap-3.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-2.5 backdrop-blur-sm transition-colors duration-200 hover:border-white/[0.09] hover:bg-white/[0.03]"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04] text-indigo-300">
                    <Icon width={15} height={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[#d7dce8]">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-5 text-[#7d879c]">
                      {detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex items-center gap-2 text-[11px] text-[#5d6577]">
            <ShieldCheckIcon width={13} height={13} />
            Private workspaces · Grounded citations · Approval-gated actions
          </div>
        </aside>

        {/* Form panel */}
        <section
          id="auth-form"
          className="relative flex min-h-dvh scroll-mt-8 flex-col justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-[26%] h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-indigo-600/[0.08] blur-[110px]" />
          </div>

          <div className="auth-rise relative mx-auto w-full max-w-[424px]">
            <div className="mb-9 flex items-center gap-2.5 lg:hidden">
              <BrandMark size={34} />
              <span className="text-sm font-semibold tracking-tight text-white">
                Cognivault AI
              </span>
            </div>

            <div className="mb-7">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-indigo-300/80">
                Secure access
              </p>
              <h2 className="text-[27px] font-semibold leading-tight tracking-[-0.025em] text-white">
                {heading}
              </h2>
              <p className="mt-2.5 text-[13.5px] leading-6 text-[#8b93a7]">
                {subheading}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.022] p-6 shadow-[0_28px_80px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-7">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
              />
              {children}
            </div>

            <div className="mt-6">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

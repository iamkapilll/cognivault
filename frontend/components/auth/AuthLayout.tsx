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
    <main className="auth-canvas relative min-h-dvh overflow-hidden text-[#f1f0f6]">
      <a
        href="#auth-form"
        className="sr-only rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to form
      </a>

      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1680px] sm:grid-cols-[minmax(0,1fr)_minmax(350px,1fr)] lg:grid-cols-[minmax(0,1.12fr)_minmax(430px,0.88fr)]">
        <aside className="auth-brand-panel relative hidden min-h-dvh overflow-hidden border-r border-white/[0.07] px-6 py-7 sm:flex sm:flex-col sm:justify-between md:px-8 lg:px-11 lg:py-9 xl:px-16 xl:py-11">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div className="absolute -left-28 -top-28 h-[460px] w-[460px] rounded-full bg-[#7062e9]/[0.18] blur-[130px]" />
            <div className="absolute -bottom-40 right-[-10%] h-[440px] w-[440px] rounded-full bg-[#8270d8]/[0.1] blur-[140px]" />
            <div className="auth-grid absolute inset-0" />
            <div className="auth-vignette absolute inset-0" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <BrandMark size={42} />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-[-0.02em] text-white">
                Cognivault <span className="text-[#b4aaff]">AI</span>
              </p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#797b8b]">
                Private intelligence workspace
              </p>
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[620px] py-10 lg:py-4">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.17em] text-[#b0a8e4]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a99bff] shadow-[0_0_12px_rgba(169,155,255,0.75)]" />
              Built around your sources
            </p>

            <h1 className="text-[30px] font-semibold leading-[1.04] tracking-[-0.045em] text-white md:text-[38px] xl:text-[54px]">
              Find the facts
              <br />
              <span className="bg-gradient-to-r from-[#c6bcff] via-[#9d91ff] to-[#8bc7ef] bg-clip-text text-transparent">
                inside your files.
              </span>
            </h1>

            <p className="mt-5 max-w-[490px] text-[12px] leading-6 text-[#a0a1af] md:text-[13px] xl:text-[14px]">
              Turn documents into a private, searchable knowledge base. Ask
              focused questions and inspect the evidence behind each answer.
            </p>

            <AuthVisual />

            <ul className="mt-6 space-y-2.5">
              {CAPABILITIES.map(({ icon: Icon, title, detail }) => (
                <li
                  key={title}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.055] bg-white/[0.025] px-3 py-2.5 backdrop-blur-sm transition duration-200 hover:border-white/[0.11] hover:bg-white/[0.04] sm:px-3.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[#b6aaff]">
                    <Icon size={15} strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-[#dedce8] sm:text-[12px]">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[9px] leading-4 text-[#868795] sm:text-[10px]">
                      {detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-[9px] text-[#737582] sm:text-[10px]">
            <ShieldCheck size={13} className="shrink-0 text-[#a99bff]" />
            Private workspaces <span className="text-[#464752">·</span> Source-grounded answers
          </div>
        </aside>

        <section
          id="auth-form"
          className="relative flex min-h-dvh scroll-mt-8 flex-col items-center justify-center px-5 py-9 sm:px-6 md:px-8 lg:px-10 xl:px-16"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-[15%] h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-[#6857dc]/[0.11] blur-[120px]" />
            <div className="absolute -bottom-48 right-[-12%] h-[360px] w-[360px] rounded-full bg-[#5651bb]/[0.08] blur-[110px]" />
          </div>

          <div className="relative z-10 mb-9 flex w-full max-w-[430px] items-center justify-between sm:hidden">
            <div className="flex items-center gap-2.5">
              <BrandMark size={36} />
              <span className="text-[13px] font-semibold tracking-[-0.02em] text-white">
                Cognivault <span className="text-[#b4aaff]">AI</span>
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-[#9a9ba7]">
              <ShieldCheck size={12} className="text-emerald-300" />
              Secure access
            </span>
          </div>

          <div className="auth-rise relative z-10 w-full max-w-[430px]">
            <div className="mb-6 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.17em] text-[#aaa0e6]">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-[#aa9cff]/15 bg-[#8275ff]/[0.09]">
                <ShieldCheck size={13} />
              </span>
              Secure workspace access
            </div>

            <div className="mb-6">
              <h2 className="text-[29px] font-semibold leading-tight tracking-[-0.04em] text-white sm:text-[32px]">
                {heading}
              </h2>
              <p className="mt-2.5 max-w-[380px] text-[12px] leading-6 text-[#9697a4] sm:text-[13px]">
                {subheading}
              </p>
            </div>

            <div className="auth-form-card relative overflow-hidden rounded-[22px] p-5 shadow-[0_32px_90px_-40px_rgba(0,0,0,0.95)] sm:p-7">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#b8adff]/30 to-transparent"
              />
              {children}
            </div>

            <div className="mt-6">{footer}</div>
          </div>

          <p className="relative z-10 mt-9 text-center text-[9px] tracking-[0.04em] text-[#656673]">
            Your files remain private to your account.
          </p>
        </section>
      </div>
    </main>
  );
}

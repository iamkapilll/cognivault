"use client";

import { Suspense } from "react";

import AgentWorkspace from "@/components/AgentWorkspace";

export default function AgentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center text-sm text-[#8b93a7]">
          Loading workspace…
        </div>
      }
    >
      <AgentWorkspace />
    </Suspense>
  );
}

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { AgentOrchestratorDemo } from "@/components/agent-orchestrator";
import { SectionSkeleton } from "@/components/section-skeleton";

function AgentsOrchestratorInner() {
  const searchParams = useSearchParams();
  const initialMessage = searchParams.get("q") ?? undefined;

  return (
    <AgentOrchestratorDemo
      key={initialMessage ?? "default"}
      initialMessage={initialMessage}
    />
  );
}

export function AgentsOrchestratorSection() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 flex-col">
          <SectionSkeleton lines={6} />
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <AgentsOrchestratorInner />
      </div>
    </Suspense>
  );
}

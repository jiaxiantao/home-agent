"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { AgentOrchestratorDemo } from "@/components/agent-orchestrator";
import { SectionSkeleton } from "@/components/section-skeleton";

function AgentsOrchestratorInner() {
  const searchParams = useSearchParams();
  const initialMessage = searchParams.get("q") ?? undefined;

  return <AgentOrchestratorDemo initialMessage={initialMessage} />;
}

export function AgentsOrchestratorSection() {
  return (
    <Suspense fallback={<SectionSkeleton lines={6} />}>
      <AgentsOrchestratorInner />
    </Suspense>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AgentOrchestratorDemo } from "@/components/agent-orchestrator";
import { SectionSkeleton } from "@/components/section-skeleton";

function AgentsOrchestratorInner() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId")?.trim() || undefined;
  const threadId = searchParams.get("threadId")?.trim() || undefined;
  const forceNew = !threadId && searchParams.get("new") === "1";
  const directPrompt =
    searchParams.get("q") ?? searchParams.get("prompt") ?? undefined;

  const [resolvedPrompt, setResolvedPrompt] = useState<string | undefined>(
    templateId ? undefined : directPrompt,
  );
  const [loadingTemplate, setLoadingTemplate] = useState(Boolean(templateId));

  useEffect(() => {
    if (threadId) {
      setResolvedPrompt(undefined);
      setLoadingTemplate(false);
      return;
    }

    if (!templateId) {
      setResolvedPrompt(directPrompt);
      setLoadingTemplate(false);
      return;
    }

    let cancelled = false;
    setLoadingTemplate(true);

    void (async () => {
      try {
        const response = await fetch(
          `/api/templates?id=${encodeURIComponent(templateId)}`,
        );
        if (!response.ok) {
          if (!cancelled) {
            setResolvedPrompt(undefined);
          }
          return;
        }

        const data = (await response.json()) as {
          template?: { id: string; prompt: string };
        };
        const prompt = data.template?.prompt?.trim();
        if (!cancelled) {
          setResolvedPrompt(prompt || undefined);
        }

        if (data.template?.id) {
          void fetch("/api/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "use", id: data.template.id }),
          });
        }
      } catch {
        if (!cancelled) {
          setResolvedPrompt(undefined);
        }
      } finally {
        if (!cancelled) {
          setLoadingTemplate(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [directPrompt, templateId, threadId]);

  if (loadingTemplate) {
    return <SectionSkeleton lines={6} />;
  }

  return (
    <AgentOrchestratorDemo
      key={
        forceNew
          ? "new-thread"
          : threadId
            ? `thread:${threadId}`
            : templateId
              ? `template:${templateId}:${resolvedPrompt ?? ""}`
              : (resolvedPrompt ?? "default")
      }
      initialMessage={threadId ? undefined : resolvedPrompt}
      initialThreadId={threadId}
      forceNew={forceNew}
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

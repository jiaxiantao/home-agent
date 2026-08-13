"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AgentComposer } from "@/components/agent-composer";
import { AgentConversation } from "@/components/agent-conversation";
import { AgentFavoritesPanel } from "@/components/agent-favorites-panel";
import { AgentTeamTemplatesPanel } from "@/components/agent-team-templates-panel";
import { AgentHistoryPanel } from "@/components/agent-history-panel";
import { AgentMockBanner } from "@/components/agent-mock-banner";
import { AgentTracePanel } from "@/components/agent-trace-panel";
import { AgentWorkflowBar } from "@/components/agent-workflow-bar";
import { useAgentStream } from "@/hooks/use-agent-sse";
import { agentQuickPrompts } from "@/lib/agent-quick-prompts";
import type { AgentResumeAction } from "@/lib/agent/types";

export function AgentOrchestratorDemo({
  initialMessage,
}: {
  initialMessage?: string;
}) {
  const [message, setMessage] = useState(initialMessage ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    run,
    resume,
    stop,
    reset,
    running,
    phase,
    currentStep,
    isMock,
    plannerLabel,
    lines,
    stats,
    pendingRunId,
    conversation,
    loadHistoryQuestion,
    llmProvider,
    setLlmProvider,
  } = useAgentStream();

  const handleA2UIAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      if (running) {
        return;
      }

      if (action !== "confirm_sql" && action !== "cancel_sql") {
        return;
      }

      const runId =
        typeof payload?.runId === "string" ? payload.runId : pendingRunId ?? undefined;
      const sql = typeof payload?.sql === "string" ? payload.sql : undefined;

      void resume({
        actionId: action,
        payload: { runId, sql },
      } satisfies AgentResumeAction);
    },
    [pendingRunId, resume, running],
  );

  const runAgent = useCallback(async () => {
    if (running || !message.trim()) {
      return;
    }

    await run(message.trim());
    setMessage("");
  }, [message, run, running]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && running) {
        event.preventDefault();
        stop();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [running, stop]);

  function handleQuickPrompt(prompt: string, runImmediately = false) {
    setMessage(prompt);
    textareaRef.current?.focus();

    if (runImmediately && !running) {
      void run(prompt.trim()).then(() => setMessage(""));
    }
  }

  function fillPrompt(prompt: string) {
    setMessage(prompt);
    textareaRef.current?.focus();
  }

  const hasConversation = conversation.length > 0;
  const lastDoneTurn = [...conversation]
    .reverse()
    .find((turn) => turn.status === "done" && turn.followUps?.length);
  const followUps = lastDoneTurn?.followUps ?? [];

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
          <AgentWorkflowBar
            phase={phase}
            running={running}
            currentStep={currentStep}
            stats={stats}
            isMock={isMock}
          />
          <button
            type="button"
            onClick={() => setSidebarOpen((current) => !current)}
            className="ui-btn-ghost lg:hidden"
          >
            {sidebarOpen ? "收起工具" : "模板/历史"}
          </button>
        </div>

        <AgentMockBanner
          visible={isMock && (running || phase === "awaiting")}
          label={plannerLabel}
        />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5 py-2 [scrollbar-gutter:stable]">
          <AgentConversation
            turns={conversation}
            onAction={handleA2UIAction}
            running={running}
            phase={phase}
          />
        </div>

        <div className="shrink-0">
          <AgentTracePanel lines={lines} running={running} />
        </div>

        <div className="shrink-0">
          <AgentComposer
            value={message}
            onChange={setMessage}
            onSubmit={() => void runAgent()}
            onStop={stop}
            onReset={reset}
            running={running}
            hasConversation={hasConversation}
            llmProvider={llmProvider}
            onLlmProviderChange={setLlmProvider}
            quickPrompts={agentQuickPrompts}
            onQuickPrompt={handleQuickPrompt}
            followUps={followUps}
            inputRef={textareaRef}
          />
        </div>
      </div>

      <aside
        className={`min-h-0 space-y-3 overflow-y-auto lg:sticky lg:top-4 lg:max-h-full ${
          sidebarOpen ? "block" : "hidden lg:block"
        }`}
      >
        <AgentTeamTemplatesPanel onSelect={fillPrompt} />

        <AgentFavoritesPanel currentPrompt={message} onSelect={fillPrompt} />

        <AgentHistoryPanel
          refreshToken={conversation.length + (stats?.totalMs ?? 0)}
          onSelect={(entry) => {
            loadHistoryQuestion(entry.question);
            fillPrompt(entry.question);
          }}
        />

        <div className="ui-panel p-3 text-[11px] leading-5 text-zinc-500">
          <p className="font-medium text-zinc-400">快捷操作</p>
          <ul className="mt-1.5 list-inside list-disc space-y-1">
            <li>⌘↵ 发送 · Esc 停止</li>
            <li>确认前可编辑 SQL</li>
            <li>正式数据：test_type = 0</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AgentComposer } from "@/components/agent-composer";
import { AgentConversation } from "@/components/agent-conversation";
import { AgentTeamTemplatesPanel } from "@/components/agent-team-templates-panel";
import { AgentHistoryPanel } from "@/components/agent-history-panel";
import { AgentMockBanner } from "@/components/agent-mock-banner";
import { AgentTracePanel } from "@/components/agent-trace-panel";
import { AgentWorkflowBar } from "@/components/agent-workflow-bar";
import { useAgentStream } from "@/hooks/use-agent-sse";
import { threadMessagesToTurns } from "@/lib/agent/thread-turns";
import type { ThreadMessage } from "@/lib/agent/thread-types";
import type { AgentResumeAction } from "@/lib/agent/types";
import type { TeamTemplateCategoryTab } from "@/lib/history/team-template-tabs";

export function AgentOrchestratorDemo({
  initialMessage,
  initialThreadId,
  forceNew,
}: {
  initialMessage?: string;
  initialThreadId?: string;
  forceNew?: boolean;
}) {
  const [message, setMessage] = useState(initialMessage ?? "");
  const [selectedCategory, setSelectedCategory] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [restoring, setRestoring] = useState(Boolean(initialThreadId));
  const [restoreError, setRestoreError] = useState<string | null>(null);
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
    threadId,
    restoreThread,
    llmProvider,
    setLlmProvider,
  } = useAgentStream({ initialThreadId, forceNew });

  useEffect(() => {
    if (!initialThreadId) {
      setRestoring(false);
      setRestoreError(null);
      return;
    }

    let cancelled = false;
    setRestoring(true);
    setRestoreError(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/agent-threads?id=${encodeURIComponent(initialThreadId)}`,
        );
        if (!response.ok) {
          if (!cancelled) {
            setRestoreError(
              response.status === 404
                ? "会话不存在或无权访问"
                : "加载历史会话失败",
            );
          }
          return;
        }

        const data = (await response.json()) as {
          thread?: { threadId: string; messages?: ThreadMessage[] };
        };
        if (!cancelled && data.thread) {
          restoreThread(
            data.thread.threadId,
            threadMessagesToTurns(data.thread.messages ?? []),
          );
        }
      } catch {
        if (!cancelled) {
          setRestoreError("加载历史会话失败");
        }
      } finally {
        if (!cancelled) {
          setRestoring(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialThreadId, restoreThread]);

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
    if (running || restoring || !message.trim()) {
      return;
    }

    await run(message.trim());
    setMessage("");
  }, [message, restoring, run, running]);

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

  function handleCategoryTab(tab: TeamTemplateCategoryTab, runImmediately = false) {
    setSelectedCategory(tab.category);
    handleQuickPrompt(tab.prompt, runImmediately);
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

        {restoreError ? (
          <p className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {restoreError}，可直接开始新对话。
          </p>
        ) : null}

        <AgentMockBanner
          visible={isMock && (running || phase === "awaiting")}
          label={plannerLabel}
        />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5 py-2 [scrollbar-gutter:stable]">
          {restoring ? (
            <p className="px-2 py-10 text-center text-sm text-zinc-500">
              正在恢复历史会话…
            </p>
          ) : (
            <AgentConversation
              turns={conversation}
              onAction={handleA2UIAction}
              running={running}
              phase={phase}
            />
          )}
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
            onReset={() => {
              setSelectedCategory(undefined);
              reset();
            }}
            running={running}
            hasConversation={hasConversation}
            llmProvider={llmProvider}
            onLlmProviderChange={setLlmProvider}
            selectedCategory={selectedCategory}
            onCategoryTab={handleCategoryTab}
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

        <AgentHistoryPanel
          refreshToken={conversation.length + (stats?.totalMs ?? 0)}
          currentThreadId={threadId}
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

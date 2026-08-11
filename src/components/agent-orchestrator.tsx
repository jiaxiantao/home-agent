"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AgentConversation } from "@/components/agent-conversation";
import { AgentEnvSwitcher } from "@/components/agent-env-switcher";
import { AgentFavoritesPanel } from "@/components/agent-favorites-panel";
import { AgentTeamTemplatesPanel } from "@/components/agent-team-templates-panel";
import { AgentHistoryPanel } from "@/components/agent-history-panel";
import { AgentMockBanner } from "@/components/agent-mock-banner";
import { AgentTracePanel } from "@/components/agent-trace-panel";
import { AgentWorkflowBar } from "@/components/agent-workflow-bar";
import { useAgentStream } from "@/hooks/use-agent-sse";
import { agentQuickPrompts } from "@/lib/agent-quick-prompts";
import { agentToolCatalog } from "@/lib/agent/tool-catalog";
import type { AgentResumeAction } from "@/lib/agent/types";

export function AgentOrchestratorDemo({
  initialMessage,
}: {
  initialMessage?: string;
}) {
  const [message, setMessage] = useState(
    initialMessage ?? "大风车正式车源一共有多少辆？",
  );
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
    analyticsEnv,
    setAnalyticsEnv,
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
      void run(prompt.trim());
    }
  }

  const hasConversation = conversation.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
      <div className="space-y-4">
        <AgentWorkflowBar
          phase={phase}
          running={running}
          currentStep={currentStep}
          stats={stats}
          isMock={isMock}
        />

        <AgentMockBanner visible={isMock && (running || phase === "awaiting")} label={plannerLabel} />

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="agent-message" className="text-sm font-medium text-slate-200">
              问数输入
            </label>
            <AgentEnvSwitcher
              value={analyticsEnv}
              onChange={setAnalyticsEnv}
              disabled={running}
            />
          </div>

          <textarea
            id="agent-message"
            ref={textareaRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void runAgent();
              }
            }}
            rows={3}
            placeholder="例如：那按城市分布呢？ / 最近 7 天趋势？"
            className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {agentQuickPrompts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleQuickPrompt(item.prompt)}
                onDoubleClick={() => handleQuickPrompt(item.prompt, true)}
                title="双击立即运行"
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/5 hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => void runAgent()}
              disabled={running || !message.trim()}
              className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? "分析中…" : hasConversation ? "继续追问" : "开始问数"}
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={!running}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              停止
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={running}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              新对话
            </button>
          </div>
        </section>

        <AgentConversation
          turns={conversation}
          onAction={handleA2UIAction}
          running={running}
        />

        <AgentTracePanel lines={lines} running={running} />
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24">
        <AgentTeamTemplatesPanel
          currentPrompt={message}
          onSelect={(prompt) => {
            setMessage(prompt);
            textareaRef.current?.focus();
          }}
        />

        <AgentFavoritesPanel
          currentPrompt={message}
          onSelect={(prompt) => {
            setMessage(prompt);
            textareaRef.current?.focus();
          }}
        />

        <AgentHistoryPanel
          refreshToken={conversation.length + (stats?.totalMs ?? 0)}
          onSelect={(entry) => {
            loadHistoryQuestion(entry.question);
            setMessage(entry.question);
            textareaRef.current?.focus();
          }}
        />

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Agent 能力
          </p>
          <ul className="mt-3 max-h-56 space-y-2.5 overflow-y-auto">
            {agentToolCatalog.slice(0, 8).map((tool) => (
              <li key={tool.name} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                <p className="font-mono text-[11px] text-cyan-300/80">{tool.name}</p>
                <p className="mt-0.5 text-sm text-slate-200">{tool.label}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-[11px] leading-6 text-slate-500">
          <p className="font-medium text-slate-400">使用说明</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>可切换测试/预发分析库（需服务端配置）</li>
            <li>收藏常用问法，下次一键回填</li>
            <li>确认 SQL 前可编辑；结果可导出 CSV</li>
            <li>正式数据：test_type = 0</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { A2UISurfaceView } from "@/components/a2ui/surface-view";
import { AgentFinalAnswer } from "@/components/agent-final-answer";
import { AgentStepMetrics } from "@/components/agent-step-metrics";
import { AgentTracePanel } from "@/components/agent-trace-panel";
import { AgentWorkflowBar } from "@/components/agent-workflow-bar";
import { IntelligenceLearningPanel } from "@/components/intelligence-learning-panel";
import { useAgentStream } from "@/hooks/use-agent-sse";
import { agentQuickPrompts } from "@/lib/agent-quick-prompts";
import { agentToolCatalog } from "@/lib/agent/tool-catalog";
import type { AgentResumeAction } from "@/lib/agent/types";
import {
  bumpLearningProfile,
  defaultIntelligencePreferences,
  exportIntelligenceConfig,
  importIntelligenceConfig,
  loadHistoryEvents,
  loadLearningProfile,
  loadIntelligencePreferences,
  pushHistoryEvent,
  resetHistoryEvents,
  resetLearningProfile,
  saveHistoryEvents,
  saveLearningProfile,
  saveIntelligencePreferences,
  type IntelligenceDepth,
  type IntelligencePreferences,
  type IntelligenceStyle,
} from "@/lib/front-intelligence-preferences";
import { cn } from "@/lib/utils";

function getAgentPromptHint(preferences: IntelligencePreferences) {
  const styleHint =
    preferences.style === "risk"
      ? "优先识别风险并给回滚策略。"
      : preferences.style === "code"
        ? "优先输出可执行动作和参数。"
        : "优先输出可执行步骤。";
  const depthHint =
    preferences.depth === "brief" ? "答案保持简短。" : "答案保持完整并解释原因。";
  const metricHint = preferences.includeMetrics
    ? "补充量化指标（延迟、步数、成功率）。"
    : "无需强制量化指标。";

  return `${styleHint} ${depthHint} ${metricHint}`;
}

export function AgentOrchestratorDemo({
  initialMessage,
}: {
  initialMessage?: string;
}) {
  const [message, setMessage] = useState(
    initialMessage ?? "大风车正式车源一共有多少辆？",
  );
  const [preferences, setPreferences] = useState(() => loadIntelligencePreferences());
  const [learningProfile, setLearningProfile] = useState(() => loadLearningProfile());
  const [historyEvents, setHistoryEvents] = useState(() => loadHistoryEvents());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    run,
    resume,
    stop,
    reset,
    appendLine,
    running,
    phase,
    currentStep,
    isMock,
    lines,
    finalAnswer,
    stats,
    stepMetrics,
    surfaces,
    pendingRunId,
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

      const resumeAction: AgentResumeAction = {
        actionId: action,
        payload: { runId },
      };
      void resume(resumeAction);
    },
    [pendingRunId, resume, running],
  );

  const recommendedPromptSuffix = useMemo(
    () => getAgentPromptHint(preferences),
    [preferences],
  );

  const runAgent = useCallback(async () => {
    if (running || !message.trim()) {
      return;
    }

    const payload = `${message.trim()}\n\n[偏好约束] ${recommendedPromptSuffix}`.trim();
    await run(payload);
  }, [message, recommendedPromptSuffix, run, running]);

  useEffect(() => {
    saveIntelligencePreferences(preferences);
  }, [preferences]);
  useEffect(() => {
    saveLearningProfile(learningProfile);
  }, [learningProfile]);
  useEffect(() => {
    saveHistoryEvents(historyEvents);
  }, [historyEvents]);

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
      const payload = `${prompt.trim()}\n\n[偏好约束] ${recommendedPromptSuffix}`.trim();
      void run(payload);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <AgentWorkflowBar
          phase={phase}
          running={running}
          currentStep={currentStep}
          stats={stats}
          isMock={isMock}
        />

        <div className="space-y-2">
          <label htmlFor="agent-message" className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            任务输入
          </label>
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
            rows={4}
            placeholder="用自然语言问数，例如：统计各状态正式车源分布…"
            className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
          />
          <p className="text-[11px] text-slate-500">
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘/Ctrl + Enter
            </kbd>{" "}
            运行 ·{" "}
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
              Esc
            </kbd>{" "}
            停止
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">工具快捷任务</p>
            <p className="text-[10px] text-slate-600">单击填入 · 双击立即运行</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {agentQuickPrompts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleQuickPrompt(item.prompt)}
                onDoubleClick={() => handleQuickPrompt(item.prompt, true)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/5 hover:text-white active:scale-[0.98]"
              >
                <span className="mr-1.5 font-mono text-[10px] text-cyan-300/70">{item.tool}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runAgent()}
            disabled={running || !message.trim()}
            className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "运行中…" : "运行 Agent 循环"}
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={!running}
            className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-200 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            停止
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={running || (!lines.length && !finalAnswer)}
            className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-400 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            清空结果
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-400 transition hover:text-slate-200"
          >
            {showAdvanced ? "收起偏好" : "编排偏好"}
          </button>
        </div>

        {showAdvanced ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/3 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              进阶偏好（localStorage）
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "steps", label: "偏步骤" },
                  { key: "risk", label: "偏风险" },
                  { key: "code", label: "偏代码" },
                ] as Array<{ key: IntelligenceStyle; label: string }>
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setPreferences((current) => {
                      const next = { ...current, style: item.key };
                      setHistoryEvents((history) => pushHistoryEvent(history, next));
                      return next;
                    });
                    setLearningProfile((current) =>
                      bumpLearningProfile(current, { style: item.key }),
                    );
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition",
                    preferences.style === item.key
                      ? "border-cyan-200/40 bg-cyan-200/15 text-cyan-100"
                      : "border-white/10 text-slate-400 hover:border-white/20",
                  )}
                >
                  {item.label}
                </button>
              ))}
              {(
                [
                  { key: "brief", label: "简略" },
                  { key: "detailed", label: "详细" },
                ] as Array<{ key: IntelligenceDepth; label: string }>
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setPreferences((current) => {
                      const next = { ...current, depth: item.key };
                      setHistoryEvents((history) => pushHistoryEvent(history, next));
                      return next;
                    });
                    setLearningProfile((current) =>
                      bumpLearningProfile(current, { depth: item.key }),
                    );
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition",
                    preferences.depth === item.key
                      ? "border-emerald-200/40 bg-emerald-200/15 text-emerald-100"
                      : "border-white/10 text-slate-400 hover:border-white/20",
                  )}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setPreferences((current) => {
                    const next = {
                      ...current,
                      includeMetrics: !current.includeMetrics,
                    };
                    setHistoryEvents((history) => pushHistoryEvent(history, next));
                    return next;
                  })
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  preferences.includeMetrics
                    ? "border-violet-200/40 bg-violet-200/15 text-violet-100"
                    : "border-white/10 text-slate-400 hover:border-white/20",
                )}
              >
                指标{preferences.includeMetrics ? "开启" : "关闭"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreferences(defaultIntelligencePreferences);
                  setHistoryEvents((history) =>
                    pushHistoryEvent(history, defaultIntelligencePreferences),
                  );
                  setLearningProfile(resetLearningProfile());
                }}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400"
              >
                恢复默认
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
              Agent 偏好约束：{recommendedPromptSuffix}
            </div>
            <IntelligenceLearningPanel
              learningProfile={learningProfile}
              preferences={preferences}
              onApplyRecommendation={(next) =>
                setPreferences((current) => {
                  const merged = { ...current, style: next.style, depth: next.depth };
                  setHistoryEvents((history) => pushHistoryEvent(history, merged));
                  return merged;
                })
              }
              history={historyEvents}
              onResetLearning={() => {
                setLearningProfile(resetLearningProfile());
                setHistoryEvents(resetHistoryEvents());
              }}
              onExport={() => {
                const blob = new Blob(
                  [
                    exportIntelligenceConfig({
                      preferences,
                      learning: learningProfile,
                      history: historyEvents,
                    }),
                  ],
                  { type: "application/json" },
                );
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "agent-intelligence-config.json";
                link.click();
                URL.revokeObjectURL(url);
              }}
              onImport={(raw) => {
                const imported = importIntelligenceConfig(raw);
                if (!imported) {
                  appendLine("error", "导入失败：配置格式无效");
                  return;
                }
                setPreferences(imported.preferences);
                setLearningProfile(imported.learning);
                setHistoryEvents(imported.history);
              }}
            />
          </div>
        ) : null}

        {surfaces.length ? (
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">结果 / 确认（A2UI）</p>
            {surfaces.map((surface) => (
              <A2UISurfaceView
                key={surface.surfaceId}
                surface={surface}
                onAction={handleA2UIAction}
                disabled={running}
              />
            ))}
          </div>
        ) : null}

        <AgentStepMetrics metrics={stepMetrics} />
        <AgentTracePanel lines={lines} running={running} />
        {finalAnswer ? <AgentFinalAnswer text={finalAnswer} running={running && phase === "answering"} /> : null}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Tools</p>
          <ul className="mt-3 space-y-3">
            {agentToolCatalog.map((tool) => {
              const quickPrompt = agentQuickPrompts.find((item) => item.tool === tool.name);

              return (
                <li key={tool.name}>
                  <button
                    type="button"
                    onClick={() => {
                      if (quickPrompt) {
                        handleQuickPrompt(quickPrompt.prompt);
                      }
                    }}
                    className="w-full rounded-xl border border-transparent p-2 text-left transition hover:border-white/10 hover:bg-white/5"
                  >
                    <span className="font-mono text-xs text-cyan-200/80">{tool.name}</span>
                    <span className="mt-1 block text-sm font-medium text-white">{tool.label}</span>
                    <span className="mt-1 block text-xs leading-6 text-slate-500">
                      {tool.description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-slate-500">
          <p className="font-semibold text-slate-400">问数提示</p>
          <p className="mt-2">
            自然语言提问后，助手会先提出只读 SQL 并等待你确认；确认后查询大风车 matador
            测试库，结果以表格/图表（A2UI）展示。需内网访问分析库。
          </p>
        </div>
      </aside>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import { IntelligenceLearningPanel } from "@/components/intelligence-learning-panel";
import { useAgentStream } from "@/hooks/use-agent-sse";
import { agentQuickPrompts } from "@/lib/agent-quick-prompts";
import { agentToolCatalog } from "@/lib/agent/tool-catalog";
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
    initialMessage ?? "帮我搜索笔记里关于前端架构的内容",
  );
  const [preferences, setPreferences] = useState(() => loadIntelligencePreferences());
  const [learningProfile, setLearningProfile] = useState(() => loadLearningProfile());
  const [historyEvents, setHistoryEvents] = useState(() => loadHistoryEvents());
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { run, stop, appendLine, running, lines, finalAnswer, stats, stepMetrics } =
    useAgentStream();

  const recommendedPromptSuffix = useMemo(
    () => getAgentPromptHint(preferences),
    [preferences],
  );

  useEffect(() => {
    saveIntelligencePreferences(preferences);
  }, [preferences]);
  useEffect(() => {
    saveLearningProfile(learningProfile);
  }, [learningProfile]);
  useEffect(() => {
    saveHistoryEvents(historyEvents);
  }, [historyEvents]);

  async function runAgent() {
    const payload = `${message.trim()}\n\n[偏好约束] ${recommendedPromptSuffix}`.trim();
    await run(payload);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <p className="text-sm leading-7 text-slate-400">
          简化 Agent 循环：用户输入 → LLM/规则规划 → 可选工具 → 结果再规划 →
          最终回答。全程 SSE 推送 trace，便于前端编排 UI。
        </p>

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/40"
        />

        <button
          type="button"
          onClick={() => setShowAdvanced((current) => !current)}
          className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
        >
          {showAdvanced ? "收起" : "展开"}编排偏好（进阶，localStorage）
        </button>

        {showAdvanced ? (
          <>
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
                  className={`rounded-full border px-3 py-1 text-xs ${
                    preferences.style === item.key
                      ? "border-cyan-200/40 bg-cyan-200/15 text-cyan-100"
                      : "border-white/10 text-slate-400"
                  }`}
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
                  className={`rounded-full border px-3 py-1 text-xs ${
                    preferences.depth === item.key
                      ? "border-emerald-200/40 bg-emerald-200/15 text-emerald-100"
                      : "border-white/10 text-slate-400"
                  }`}
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
                className={`rounded-full border px-3 py-1 text-xs ${
                  preferences.includeMetrics
                    ? "border-violet-200/40 bg-violet-200/15 text-violet-100"
                    : "border-white/10 text-slate-400"
                }`}
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
          </>
        ) : null}

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            工具快捷任务
          </p>
          <div className="flex flex-wrap gap-2">
            {agentQuickPrompts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMessage(item.prompt)}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:text-white"
              >
                <span className="mr-1.5 font-mono text-[10px] text-cyan-300/70">
                  {item.tool}
                </span>
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
            className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {running ? "运行中…" : "运行 Agent 循环"}
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={!running}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 disabled:opacity-40"
          >
            停止
          </button>
        </div>

        {stats ? (
          <p className="font-mono text-xs text-slate-500">
            steps {stats.steps} · tools {stats.toolCalls} · total {stats.totalMs} ms
          </p>
        ) : null}

        {stepMetrics.length ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-mono text-[11px] text-slate-500">step latency</p>
            <div className="mt-3 space-y-2">
              {[...stepMetrics]
                .sort((a, b) => a.step - b.step)
                .map((metric) => {
                  const total = Math.max(metric.planMs + (metric.toolMs ?? 0), 1);
                  const planWidth = Math.max((metric.planMs / total) * 100, 8);
                  const toolWidth = metric.toolMs
                    ? Math.max((metric.toolMs / total) * 100, 8)
                    : 0;

                  return (
                    <div key={metric.step} className="space-y-1">
                      <p className="font-mono text-[11px] text-slate-400">
                        step {metric.step} · total {metric.totalMs} ms
                      </p>
                      <div className="flex h-2 overflow-hidden rounded bg-white/10">
                        <div
                          className="bg-cyan-300/80"
                          style={{ width: `${planWidth}%` }}
                          title={`plan ${metric.planMs}ms`}
                        />
                        {toolWidth ? (
                          <div
                            className="bg-violet-300/80"
                            style={{ width: `${toolWidth}%` }}
                            title={`tool ${metric.toolMs}ms`}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6 text-slate-300">
          {lines.length ? (
            <ul className="space-y-2">
              {lines.map((line) => (
                <li key={line.id} className="whitespace-pre-wrap">
                  <span className="text-cyan-200/70">{line.kind}</span> {line.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">trace 将显示在这里</p>
          )}
        </div>

        {finalAnswer ? (
          <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              Final
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">
              {finalAnswer}
            </p>
          </div>
        ) : null}
      </div>

      <aside className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Tools
        </p>
        <ul className="mt-3 space-y-3">
          {agentToolCatalog.map((tool) => (
            <li key={tool.name} className="text-xs leading-6 text-slate-400">
              <span className="font-mono text-cyan-200/80">{tool.name}</span>
              <span className="block text-slate-500">{tool.description}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

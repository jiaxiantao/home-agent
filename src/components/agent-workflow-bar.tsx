"use client";

import type { AgentPhase, AgentRunStats } from "@/hooks/use-agent-sse";
import { cn } from "@/lib/utils";

const workflowSteps = [
  { key: "input", label: "输入" },
  { key: "planning", label: "规划" },
  { key: "tool", label: "工具" },
  { key: "answering", label: "回答" },
] as const;

function stepState(
  stepKey: (typeof workflowSteps)[number]["key"],
  phase: AgentPhase,
  running: boolean,
) {
  if (stepKey === "input") {
    if (phase === "idle" && !running) {
      return "current";
    }
    return "done";
  }

  if (stepKey === "planning") {
    if (phase === "planning") {
      return running ? "current" : "done";
    }
    if (["tool", "awaiting", "answering", "done"].includes(phase)) {
      return "done";
    }
    return "upcoming";
  }

  if (stepKey === "tool") {
    if (phase === "tool" || phase === "awaiting") {
      return "current";
    }
    if (["answering", "done"].includes(phase)) {
      return "done";
    }
    return "upcoming";
  }

  if (phase === "answering" && running) {
    return "current";
  }
  if (phase === "done") {
    return "done";
  }
  if (phase === "error") {
    return "error";
  }

  return "upcoming";
}

const phaseLabels: Record<AgentPhase, string> = {
  idle: "等待运行",
  planning: "规划器中…",
  tool: "执行工具中…",
  awaiting: "等待确认 SQL…",
  answering: "生成最终回答…",
  done: "运行完成",
  error: "运行出错",
};

export function AgentWorkflowBar({
  phase,
  running,
  currentStep,
  stats,
  isMock,
}: {
  phase: AgentPhase;
  running: boolean;
  currentStep: number;
  stats: AgentRunStats | null;
  isMock: boolean;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-2 w-2 rounded-full",
              running
                ? "animate-pulse bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]"
                : phase === "done"
                  ? "bg-emerald-400"
                  : phase === "error"
                    ? "bg-rose-400"
                    : "bg-slate-600",
            )}
            aria-hidden
          />
          <p className="text-sm text-slate-300">
            {phaseLabels[phase]}
            {currentStep > 0 ? (
              <span className="ml-2 font-mono text-xs text-slate-500">step {currentStep}</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isMock ? (
            <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2 py-0.5 text-[10px] text-amber-100">
              规则规划器
            </span>
          ) : stats ? (
            <span className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-2 py-0.5 text-[10px] text-cyan-100">
              LLM 规划
            </span>
          ) : null}
          {stats ? (
            <span className="font-mono text-[11px] text-slate-500">
              {stats.steps} 步 · {stats.toolCalls} 工具 · {stats.totalMs} ms
            </span>
          ) : null}
        </div>
      </div>

      <ol className="grid grid-cols-4 gap-2">
        {workflowSteps.map((step, index) => {
          const state = stepState(step.key, phase, running);

          return (
            <li key={step.key} className="relative">
              {index > 0 ? (
                <span
                  className={cn(
                    "absolute -left-1 top-3 hidden h-px w-2 -translate-x-full sm:block",
                    state === "upcoming" ? "bg-white/10" : "bg-cyan-300/40",
                  )}
                  aria-hidden
                />
              ) : null}
              <div
                className={cn(
                  "rounded-xl border px-2 py-2 text-center transition-colors",
                  state === "current" &&
                    "border-cyan-300/40 bg-cyan-300/10 text-cyan-100",
                  state === "done" && "border-emerald-300/20 bg-emerald-300/5 text-emerald-100",
                  state === "error" && "border-rose-300/30 bg-rose-300/10 text-rose-100",
                  state === "upcoming" && "border-white/10 bg-white/5 text-slate-500",
                )}
              >
                <p className="text-[10px] uppercase tracking-[0.16em]">{step.label}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

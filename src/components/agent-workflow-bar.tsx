"use client";

import type { AgentPhase, AgentRunStats } from "@/hooks/use-agent-sse";
import { cn } from "@/lib/utils";

const phaseLabels: Record<AgentPhase, string> = {
  idle: "就绪",
  planning: "规划中",
  tool: "执行中",
  awaiting: "待确认 SQL",
  answering: "生成结论",
  done: "已完成",
  error: "出错",
};

export function AgentWorkflowBar({
  phase,
  running,
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "inline-flex h-2 w-2 rounded-full",
            running
              ? "animate-pulse bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.7)]"
              : phase === "done"
                ? "bg-emerald-400"
                : phase === "error"
                  ? "bg-rose-400"
                  : phase === "awaiting"
                    ? "bg-amber-400"
                    : "bg-slate-600",
          )}
          aria-hidden
        />
        <span className="text-sm font-medium text-slate-200">{phaseLabels[phase]}</span>
        {isMock ? (
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200/90">
            规则模式
          </span>
        ) : stats ? (
          <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-200/90">
            LLM
          </span>
        ) : null}
      </div>

      {stats ? (
        <p className="font-mono text-[11px] text-slate-500">
          {stats.steps} 步 · {stats.toolCalls} 工具 · {stats.totalMs} ms
        </p>
      ) : (
        <p className="text-[11px] text-slate-600">自然语言问数 → 确认 SQL → 图表</p>
      )}
    </div>
  );
}

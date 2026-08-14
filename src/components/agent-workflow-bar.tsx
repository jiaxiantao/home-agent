"use client";

import type { AgentPhase, AgentRunStats } from "@/hooks/use-agent-sse";
import { cn } from "@/lib/utils";

const phaseLabels: Record<AgentPhase, string> = {
  idle: "就绪",
  planning: "规划中",
  tool: "执行工具",
  awaiting: "等待确认",
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
    <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 py-1">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-1.5 w-1.5 rounded-full",
            running
              ? "animate-pulse bg-brand-soft"
              : phase === "done"
                ? "bg-brand shadow-[0_0_8px_rgba(255,102,0,0.55)]"
                : phase === "error"
                  ? "bg-rose-400"
                  : phase === "awaiting"
                    ? "bg-brand"
                    : "bg-zinc-600",
          )}
          aria-hidden
        />
        <span className="text-[12px] text-muted">{phaseLabels[phase]}</span>
        {isMock ? (
          <span className="ui-chip-brand">
            规则模式
          </span>
        ) : null}
      </div>

      {stats ? (
        <p className="font-mono text-[10px] text-muted-foreground">
          {stats.steps} 步 · {stats.toolCalls} 工具 · {stats.totalMs} ms
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground">提问 → 确认 SQL → 结果</p>
      )}
    </div>
  );
}

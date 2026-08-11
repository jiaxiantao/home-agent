"use client";

import type { ConversationTurn } from "@/hooks/use-agent-sse";
import { A2UISurfaceView } from "@/components/a2ui/surface-view";
import { AgentFinalAnswer } from "@/components/agent-final-answer";

export function AgentConversation({
  turns,
  onAction,
  running,
}: {
  turns: ConversationTurn[];
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
  running?: boolean;
}) {
  if (!turns.length) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-slate-300">对话记录</h2>
      {turns.map((turn) => (
        <article
          key={turn.id}
          className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                提问
              </p>
              <p className="mt-1 text-sm text-white">{turn.question}</p>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
              {turn.status === "awaiting"
                ? "待确认"
                : turn.status === "running"
                  ? "进行中"
                  : turn.status === "done"
                    ? "已完成"
                    : turn.status === "cancelled"
                      ? "已取消"
                      : "出错"}
            </span>
          </div>

          {turn.isMock ? (
            <p className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              当前轮次使用规则规划器（LLM 未启用或调用失败），结果仅供演示。
            </p>
          ) : null}

          {turn.surfaces.map((surface) => (
            <A2UISurfaceView
              key={surface.surfaceId}
              surface={surface}
              onAction={onAction}
              disabled={
                running ||
                turn.status !== "awaiting" ||
                turn.id !== turns.at(-1)?.id
              }
            />
          ))}

          {turn.finalAnswer ? (
            <AgentFinalAnswer text={turn.finalAnswer} running={false} />
          ) : null}
        </article>
      ))}
    </section>
  );
}

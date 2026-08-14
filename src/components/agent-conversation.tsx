"use client";

import { useEffect, useRef } from "react";

import type { AgentPhase, ConversationTurn } from "@/hooks/use-agent-sse";
import { A2UISurfaceView } from "@/components/a2ui/surface-view";
import { AgentActivitySteps } from "@/components/agent-activity-steps";
import { AgentFinalAnswer } from "@/components/agent-final-answer";
import { cn } from "@/lib/utils";

const phaseHints: Partial<Record<AgentPhase, string>> = {
  planning: "规划下一步…",
  tool: "执行工具…",
  answering: "整理结论…",
  awaiting: "等待确认 SQL",
};

function getScrollParent(node: HTMLElement | null) {
  let current = node?.parentElement ?? null;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function scrollConversationToBottom(anchor: HTMLElement | null, smooth: boolean) {
  if (!anchor) {
    return;
  }

  const container = getScrollParent(anchor);
  if (container) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    return;
  }

  anchor.scrollIntoView({
    behavior: smooth ? "smooth" : "auto",
    block: "end",
  });
}

function TurnStatusDot({ status }: { status: ConversationTurn["status"] }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        status === "running" && "animate-pulse bg-brand-soft",
        status === "awaiting" && "bg-brand",
        status === "done" && "bg-brand shadow-[0_0_8px_rgba(255,102,0,0.55)]",
        status === "error" && "bg-rose-400",
        status === "cancelled" && "bg-zinc-600",
      )}
      aria-hidden
    />
  );
}

export function AgentConversation({
  turns,
  onAction,
  running,
  phase,
}: {
  turns: ConversationTurn[];
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
  running?: boolean;
  phase?: AgentPhase;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTurn = turns.at(-1);
  const isLive = Boolean(running && lastTurn);

  useEffect(() => {
    if (!turns.length) {
      return;
    }

    let cancelled = false;
    const smooth = isLive;

    function run() {
      if (!cancelled) {
        scrollConversationToBottom(bottomRef.current, smooth);
      }
    }

    const frame = window.requestAnimationFrame(() => {
      run();
      window.requestAnimationFrame(run);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [
    isLive,
    turns.length,
    lastTurn?.id,
    lastTurn?.steps.length,
    lastTurn?.surfaces.length,
    lastTurn?.finalAnswer,
    lastTurn?.planStreamText,
  ]);

  if (!turns.length) {
    return (
      <section className="flex min-h-[280px] flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-[13px] font-medium text-brand-soft">用自然语言提问</p>
        <p className="mt-2 max-w-md text-[12px] leading-6 text-muted">
          例如：「客户手机号为 13166990795 的客户信息」「车牌号为 皖JV066M 的车辆信息」。也可按微信号查客户。Agent 会自动选库、调接口或生成 SQL。
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {turns.map((turn, index) => {
        const isLatest = index === turns.length - 1;
        const turnRunning = Boolean(running && isLatest && turn.status === "running");

        return (
          <article key={turn.id} className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[92%] rounded-2xl rounded-br-md border border-brand/15 bg-brand/10 px-3.5 py-2.5 text-[13px] leading-6 text-foreground">
                {turn.question}
              </div>
            </div>

            <div className="flex gap-2.5">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-brand/25 bg-brand/10 text-[10px] font-medium text-brand-soft">
                A
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex items-center gap-2">
                  <TurnStatusDot status={turn.status} />
                  <span className="text-[11px] text-muted">
                    {turn.status === "awaiting"
                      ? "等待你确认"
                      : turn.status === "running"
                        ? "处理中"
                        : turn.status === "done"
                          ? "已完成"
                          : turn.status === "cancelled"
                            ? "已取消"
                            : "出错"}
                  </span>
                  {turn.isMock ? (
                    <span className="ui-chip-brand">
                      规则模式
                    </span>
                  ) : null}
                  {turn.stats ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {turn.stats.steps} 步 · {turn.stats.toolCalls} 工具 · {turn.stats.totalMs} ms
                    </span>
                  ) : null}
                </div>

                <AgentActivitySteps
                  steps={turn.steps}
                  running={turnRunning}
                  phaseLabel={phase ? phaseHints[phase] : undefined}
                  streamText={turn.planStreamText}
                />

                {turn.surfaces.map((surface) => (
                  <A2UISurfaceView
                    key={surface.surfaceId}
                    surface={surface}
                    onAction={onAction}
                    disabled={
                      running ||
                      turn.status !== "awaiting" ||
                      !isLatest
                    }
                    variant={
                      surface.title?.includes("确认") ||
                      surface.title?.includes("重试")
                        ? "approval"
                        : "result"
                    }
                  />
                ))}

                {turn.finalAnswer ? (
                  <AgentFinalAnswer
                    text={turn.finalAnswer}
                    running={Boolean(turnRunning && turn.answerStreaming)}
                  />
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
      <div ref={bottomRef} />
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import type { AgentTraceLine } from "@/hooks/use-agent-sse";
import { cn } from "@/lib/utils";

const kindStyles: Record<string, { label: string; className: string }> = {
  trace: {
    label: "TRACE",
    className: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  },
  plan: {
    label: "PLAN",
    className: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  },
  tool: {
    label: "TOOL",
    className: "border-violet-300/30 bg-violet-300/10 text-violet-100",
  },
  result: {
    label: "RESULT",
    className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  },
  error: {
    label: "ERROR",
    className: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  },
};

export function AgentTracePanel({
  lines,
  running,
}: {
  lines: AgentTraceLine[];
  running: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, running, autoScroll]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            SSE Trace
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {lines.length ? `${lines.length} 条事件` : "实时事件流"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoScroll((current) => !current)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[10px] transition",
            autoScroll
              ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
              : "border-white/10 text-slate-400 hover:text-slate-200",
          )}
        >
          自动滚动 {autoScroll ? "开" : "关"}
        </button>
      </div>

      <div className="max-h-[min(52vh,28rem)] overflow-y-auto p-4 font-mono text-xs leading-6 text-slate-300">
        {lines.length ? (
          <ul className="space-y-2">
            {lines.map((line) => {
              const style = kindStyles[line.kind] ?? kindStyles.trace;

              return (
                <li key={line.id} className="trace-line-enter flex gap-3 whitespace-pre-wrap">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-fit shrink-0 rounded border px-1.5 py-0.5 text-[9px] tracking-[0.12em]",
                      style.className,
                    )}
                  >
                    {style.label}
                  </span>
                  <span className="min-w-0 flex-1 text-slate-300">{line.text}</span>
                </li>
              );
            })}
            {running ? (
              <li className="flex items-center gap-2 text-slate-500">
                <span className="inline-flex gap-1" aria-hidden>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:240ms]" />
                </span>
                等待下一条事件…
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
            <p className="text-sm text-slate-400">Trace 将在这里实时展示</p>
            <p className="mt-2 text-[11px] leading-6 text-slate-500">
              运行后可见规划、工具调用与结果事件
              <br />
              支持 ⌘/Ctrl + Enter 快速运行
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}

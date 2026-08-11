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
  awaiting: {
    label: "WAIT",
    className: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  },
  a2ui: {
    label: "UI",
    className: "border-sky-300/30 bg-sky-300/10 text-sky-100",
  },
  error: {
    label: "ERROR",
    className: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  },
};

export function AgentTracePanel({
  lines,
  running,
  defaultExpanded = false,
}: {
  lines: AgentTraceLine[];
  running: boolean;
  defaultExpanded?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (running || lines.some((line) => line.kind === "error")) {
      setExpanded(true);
    }
  }, [running, lines]);

  useEffect(() => {
    if (!autoScroll || !expanded) {
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, running, autoScroll, expanded]);

  const hasContent = lines.length > 0 || running;

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <div>
          <p className="text-sm font-medium text-slate-300">执行轨迹</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {hasContent ? `${lines.length} 条事件` : "规划、工具调用与 SSE 事件"}
          </p>
        </div>
        <span className="text-xs text-slate-500">{expanded ? "收起 ▴" : "展开 ▾"}</span>
      </button>

      {expanded ? (
        <>
          <div className="flex items-center justify-end border-t border-white/10 px-4 py-2">
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

          <div className="max-h-72 overflow-y-auto border-t border-white/10 p-4 font-mono text-xs leading-6 text-slate-300">
            {hasContent ? (
              <ul className="space-y-2">
                {lines.map((line) => {
                  const style = kindStyles[line.kind] ?? kindStyles.trace;

                  return (
                    <li key={line.id} className="flex gap-3 whitespace-pre-wrap">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-fit shrink-0 rounded border px-1.5 py-0.5 text-[9px] tracking-[0.12em]",
                          style.className,
                        )}
                      >
                        {style.label}
                      </span>
                      <span className="min-w-0 flex-1">{line.text}</span>
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
              <p className="py-6 text-center text-sm text-slate-500">运行后将在此展示详细轨迹</p>
            )}
            <div ref={bottomRef} />
          </div>
        </>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import type { AgentTraceLine } from "@/hooks/use-agent-sse";
import { cn } from "@/lib/utils";

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
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [userCollapsed, setUserCollapsed] = useState(false);
  const autoExpand = lines.some((line) => line.kind === "error");
  const showExpanded = userCollapsed ? false : expanded || autoExpand;

  useEffect(() => {
    if (!showExpanded) {
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, showExpanded]);

  if (!lines.length && !running) {
    return null;
  }

  return (
    <section className="mb-2 overflow-hidden rounded-lg border border-white/[0.06]">
      <button
        type="button"
        onClick={() => {
          if (showExpanded) {
            setUserCollapsed(true);
            setExpanded(false);
          } else {
            setUserCollapsed(false);
            setExpanded(true);
          }
        }}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-white/[0.02]"
      >
        <p className="text-[11px] text-zinc-500">
          原始事件流 · {lines.length} 条
          {running ? " · 实时" : ""}
        </p>
        <span className="text-[10px] text-zinc-600">
          {showExpanded ? "收起" : "展开"}
        </span>
      </button>

      {showExpanded ? (
        <div className="max-h-40 overflow-y-auto border-t border-white/[0.05] px-3 py-2 font-mono text-[10px] leading-5 text-zinc-600">
          <ul className="space-y-1">
            {lines.map((line) => (
              <li
                key={line.id}
                className={cn(
                  "trace-line-enter whitespace-pre-wrap",
                  line.kind === "error" && "text-rose-400",
                )}
              >
                <span className="text-zinc-700">[{line.kind}] </span>
                {line.text}
              </li>
            ))}
          </ul>
          <div ref={bottomRef} />
        </div>
      ) : null}
    </section>
  );
}

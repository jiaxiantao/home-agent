"use client";

import { useEffect, useRef, useState } from "react";

import type { AgentTraceLine } from "@/hooks/use-agent-sse";
import { cn } from "@/lib/utils";

export function formatAgentTraceText(lines: AgentTraceLine[]) {
  return lines.map((line) => `[${line.kind}] ${line.text}`).join("\n");
}

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
  const [copied, setCopied] = useState(false);
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

  function toggleExpanded() {
    if (showExpanded) {
      setUserCollapsed(true);
      setExpanded(false);
    } else {
      setUserCollapsed(false);
      setExpanded(true);
    }
  }

  async function copyTrace() {
    if (!lines.length) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatAgentTraceText(lines));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mb-2 overflow-hidden rounded-lg border border-border">
      <div className="flex w-full items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="min-w-0 flex-1 text-left transition hover:text-muted"
        >
          <p className="text-[11px] text-muted">
            原始事件流 · {lines.length} 条
            {running ? " · 实时" : ""}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void copyTrace()}
            disabled={!lines.length}
            className="text-[10px] text-muted-foreground transition hover:text-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? "已复制" : "复制"}
          </button>
          <button
            type="button"
            onClick={toggleExpanded}
            className="text-[10px] text-muted-foreground transition hover:text-muted"
          >
            {showExpanded ? "收起" : "展开"}
          </button>
        </div>
      </div>

      {showExpanded ? (
        <div className="max-h-40 overflow-y-auto border-t border-border px-3 py-2 font-mono text-[10px] leading-5 text-muted-foreground">
          <ul className="space-y-1">
            {lines.map((line) => (
              <li
                key={line.id}
                className={cn(
                  "trace-line-enter whitespace-pre-wrap",
                  line.kind === "error" && "text-rose-400",
                )}
              >
                <span className="text-muted">[{line.kind}] </span>
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

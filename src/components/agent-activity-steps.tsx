"use client";

import { useState } from "react";

import type { AgentActivityStep } from "@/hooks/use-agent-sse";
import { cn } from "@/lib/utils";

function StepIcon({
  kind,
  status,
}: {
  kind: AgentActivityStep["kind"];
  status: AgentActivityStep["status"];
}) {
  if (status === "running") {
    return (
      <span
        className="mt-0.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border border-zinc-500 border-t-zinc-200"
        aria-hidden
      />
    );
  }

  if (kind === "error" || status === "error") {
    return (
      <span className="mt-0.5 text-[11px] text-rose-400" aria-hidden>
        ✕
      </span>
    );
  }

  if (kind === "awaiting") {
    return (
      <span className="mt-0.5 text-[11px] text-amber-400" aria-hidden>
        ◎
      </span>
    );
  }

  if (kind === "plan") {
    return (
      <span className="mt-0.5 text-[11px] text-zinc-500" aria-hidden>
        ▸
      </span>
    );
  }

  return (
    <span className="mt-0.5 text-[11px] text-zinc-500" aria-hidden>
      ✓
    </span>
  );
}

function ActivityStepRow({ step }: { step: AgentActivityStep }) {
  const [open, setOpen] = useState(
    step.kind === "error" || step.status === "running",
  );
  const hasDetail = Boolean(step.detail?.trim());

  return (
    <div className="group">
      <button
        type="button"
        disabled={!hasDetail}
        onClick={() => hasDetail && setOpen((current) => !current)}
        className={cn(
          "flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition",
          hasDetail ? "hover:bg-white/[0.03]" : "cursor-default",
        )}
      >
        <StepIcon kind={step.kind} status={step.status} />
        <span
          className={cn(
            "min-w-0 flex-1 text-[12px] leading-5",
            step.kind === "error" ? "text-rose-300" : "text-zinc-400",
            step.status === "running" && "text-zinc-300",
          )}
        >
          {step.title}
        </span>
        {hasDetail ? (
          <span className="mt-0.5 text-[10px] text-zinc-600 opacity-0 transition group-hover:opacity-100">
            {open ? "▾" : "▸"}
          </span>
        ) : null}
      </button>
      {open && hasDetail ? (
        <pre className="ml-5 mt-0.5 max-h-40 overflow-auto rounded-md border border-white/[0.06] bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-5 text-zinc-500">
          {step.detail}
        </pre>
      ) : null}
    </div>
  );
}

export function AgentActivitySteps({
  steps,
  running,
  phaseLabel,
}: {
  steps: AgentActivityStep[];
  running?: boolean;
  phaseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(true);

  if (!steps.length && !running) {
    return null;
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015]">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          {running ? (
            <span
              className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-zinc-200"
              aria-hidden
            />
          ) : (
            <span className="text-[11px] text-zinc-500" aria-hidden>
              ◆
            </span>
          )}
          <span className="text-[12px] text-zinc-400">
            {running
              ? phaseLabel || "思考中…"
              : `已完成 ${steps.length} 个步骤`}
          </span>
        </div>
        <span className="text-[10px] text-zinc-600">
          {expanded ? "收起" : "展开"}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-0.5 border-t border-white/[0.05] px-2 py-2">
          {steps.map((step) => (
            <ActivityStepRow key={step.id} step={step} />
          ))}
          {running ? (
            <div className="flex items-center gap-2 px-1.5 py-1 text-[12px] text-zinc-500">
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-zinc-600 border-t-zinc-300"
                aria-hidden
              />
              {phaseLabel || "继续处理…"}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

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
        className="mt-0.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border border-brand/30 border-t-brand"
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
      <span className="mt-0.5 text-[11px] text-brand" aria-hidden>
        ◎
      </span>
    );
  }

  if (kind === "plan") {
    return (
      <span className="mt-0.5 text-[11px] text-muted" aria-hidden>
        ▸
      </span>
    );
  }

  return (
    <span className="mt-0.5 text-[11px] text-brand-soft" aria-hidden>
      ✓
    </span>
  );
}

function ActivityStepRow({
  step,
  forceDone,
}: {
  step: AgentActivityStep;
  forceDone?: boolean;
}) {
  const [open, setOpen] = useState(
    step.kind === "error" || step.status === "running",
  );
  const hasDetail = Boolean(step.detail?.trim());
  const status =
    forceDone && step.status === "running" ? "done" : step.status;

  return (
    <div className="group">
      <button
        type="button"
        disabled={!hasDetail}
        onClick={() => hasDetail && setOpen((current) => !current)}
        className={cn(
          "flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition",
          hasDetail ? "hover:bg-brand/5" : "cursor-default",
        )}
      >
        <StepIcon kind={step.kind} status={status} />
        <span
          className={cn(
            "min-w-0 flex-1 text-[12px] leading-5",
            step.kind === "error" ? "text-rose-300" : "text-muted",
            status === "running" && "text-brand-soft",
          )}
        >
          {step.title}
        </span>
        {hasDetail ? (
          <span className="mt-0.5 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
            {open ? "▾" : "▸"}
          </span>
        ) : null}
      </button>
      {open && hasDetail ? (
        <pre className="ml-5 mt-0.5 max-h-40 overflow-auto rounded-md border border-border bg-input px-2.5 py-2 font-mono text-[11px] leading-5 text-muted">
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
  streamText,
}: {
  steps: AgentActivityStep[];
  running?: boolean;
  phaseLabel?: string;
  streamText?: string;
}) {
  const [expanded, setExpanded] = useState(Boolean(running));

  useEffect(() => {
    if (running) {
      setExpanded(true);
    }
  }, [running]);

  if (!steps.length && !running) {
    return null;
  }

  return (
    <div className="ui-panel">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          {running ? (
            <span
              className="inline-block h-3 w-3 animate-spin rounded-full border border-brand/30 border-t-brand"
              aria-hidden
            />
          ) : (
            <span className="text-[11px] text-muted" aria-hidden>
              ◆
            </span>
          )}
          <span className="text-[12px] text-muted">
            {running
              ? phaseLabel || "思考中…"
              : `已完成 ${steps.length} 个步骤`}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {expanded ? "收起" : "展开"}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-0.5 border-t border-border px-2 py-2">
          {streamText ? (
            <div className="mb-1 rounded-md border border-brand/15 bg-brand/5 px-2.5 py-2">
              <p className="mb-1 text-[10px] text-brand-soft">规划思考</p>
              <p className="whitespace-pre-wrap text-[12px] leading-6 text-foreground">
                {streamText}
                {running ? (
                  <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-brand align-middle" />
                ) : null}
              </p>
            </div>
          ) : null}
          {steps.map((step) => (
            <ActivityStepRow key={step.id} step={step} forceDone={!running} />
          ))}
          {running && !streamText ? (
            <div className="flex items-center gap-2 px-1.5 py-1 text-[12px] text-muted">
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-brand/30 border-t-brand"
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

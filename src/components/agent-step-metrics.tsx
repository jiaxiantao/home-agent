"use client";

import type { AgentStepMetric } from "@/hooks/use-agent-sse";

export function AgentStepMetrics({ metrics }: { metrics: AgentStepMetric[] }) {
  if (!metrics.length) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
          Step Latency
        </p>
        <p className="text-[10px] text-slate-500">
          <span className="mr-2 inline-block h-2 w-2 rounded-sm bg-cyan-300/80 align-middle" />
          规划
          <span className="mx-2 inline-block h-2 w-2 rounded-sm bg-violet-300/80 align-middle" />
          工具
        </p>
      </div>
      <div className="mt-3 space-y-3">
        {[...metrics]
          .sort((left, right) => left.step - right.step)
          .map((metric) => {
            const total = Math.max(metric.planMs + (metric.toolMs ?? 0), 1);
            const planWidth = Math.max((metric.planMs / total) * 100, 8);
            const toolWidth = metric.toolMs
              ? Math.max((metric.toolMs / total) * 100, 8)
              : 0;

            return (
              <div key={metric.step} className="space-y-1.5">
                <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                  <span>Step {metric.step}</span>
                  <span>{metric.totalMs} ms</span>
                </div>
                <div
                  className="flex h-2.5 overflow-hidden rounded-full bg-white/10"
                  role="img"
                  aria-label={`Step ${metric.step}: plan ${metric.planMs}ms${metric.toolMs ? `, tool ${metric.toolMs}ms` : ""}`}
                >
                  <div
                    className="bg-cyan-300/80 transition-[width] duration-500 ease-out"
                    style={{ width: `${planWidth}%` }}
                  />
                  {toolWidth ? (
                    <div
                      className="bg-violet-300/80 transition-[width] duration-500 ease-out"
                      style={{ width: `${toolWidth}%` }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}

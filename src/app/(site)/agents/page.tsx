import type { Metadata } from "next";

import { AgentsOrchestratorSection } from "@/components/agents-orchestrator-section";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "Frontend agent orchestration demo: plan, tool calls, and SSE traces.",
};

export default function AgentsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8 lg:py-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_42%)]"
          aria-hidden
        />
        <div className="relative">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Agents</p>
          <h1 className="mt-4 text-3xl font-semibold text-white md:text-4xl">
            AI Agent 前端编排
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            从输入到规划、工具执行再到最终回答，全程 SSE 流式 trace。适合学习 Agent
            循环如何驱动编排 UI，以及如何用工作流状态反馈运行进度。
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              search_notes
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              calculate
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              current_time
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-4 md:p-6 lg:p-8">
        <AgentsOrchestratorSection />
      </section>
    </main>
  );
}

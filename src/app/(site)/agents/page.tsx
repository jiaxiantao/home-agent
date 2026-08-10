import type { Metadata } from "next";

import { AgentsOrchestratorSection } from "@/components/agents-orchestrator-section";

export const metadata: Metadata = {
  title: "数据分析助手",
  description:
    "大风车自然语言问数：生成只读 SQL，确认后查询并渲染表格/图表。",
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
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Data Agent</p>
          <h1 className="mt-4 text-3xl font-semibold text-white md:text-4xl">
            大风车数据分析助手
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            用自然语言提问，模型生成只读 MySQL，经你确认后查询 matador 测试库，并以
            A2UI 表格/图表展示结果。轨迹面板仍可观察 Plan → Tool → Answer 编排过程。
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              propose_sql
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              execute_sql
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              build_chart
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              A2UI
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

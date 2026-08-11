import type { Metadata } from "next";

import { AgentsOrchestratorSection } from "@/components/agents-orchestrator-section";

export const metadata: Metadata = {
  title: "数据分析助手",
  description:
    "大风车自然语言问数：生成只读 SQL，确认后查询并渲染表格/图表。",
};

export default function AgentsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 lg:py-6">
      <header className="mb-4 flex items-end justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div>
          <h1 className="text-[15px] font-medium tracking-tight text-zinc-100">
            数据分析助手
          </h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            自然语言问数 · 确认 SQL · 表格与图表
          </p>
        </div>
      </header>

      <AgentsOrchestratorSection />
    </main>
  );
}

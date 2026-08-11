import type { Metadata } from "next";

import { AgentsOrchestratorSection } from "@/components/agents-orchestrator-section";

export const metadata: Metadata = {
  title: "数据分析助手",
  description:
    "大风车自然语言问数：生成只读 SQL，确认后查询并渲染表格/图表。",
};

export default function AgentsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">Data Agent</p>
        <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
          大风车数据分析助手
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          自然语言问数，确认 SQL 后查询 matador 测试库，结果以表格和图表展示。
        </p>
      </header>

      <AgentsOrchestratorSection />
    </main>
  );
}

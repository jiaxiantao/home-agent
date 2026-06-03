import type { Metadata } from "next";

import { AgentsOrchestratorSection } from "@/components/agents-orchestrator-section";
import { agentToolCatalog } from "@/lib/agent/tool-catalog";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "Frontend agent orchestration demo: plan, tool calls, and SSE traces.",
};

export default function AgentsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-10 lg:px-8 lg:py-16">
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Agents</p>
        <h1 className="mt-4 text-3xl font-semibold text-white md:text-4xl">
          AI Agent 前端编排
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
          用户输入 → 规划器判断工具 → 执行 search_notes / calculate / current_time →
          再规划 → 流式 trace 输出。登录 admin 后可将编排偏好同步到 PostgreSQL。
        </p>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-6 md:p-8">
        <AgentsOrchestratorSection />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {agentToolCatalog.map((tool) => (
          <div
            key={tool.name}
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
          >
            <p className="font-mono text-sm text-cyan-200/90">{tool.name}</p>
            <p className="mt-2 text-sm font-semibold text-white">{tool.label}</p>
            <p className="mt-2 text-xs leading-6 text-slate-400">{tool.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

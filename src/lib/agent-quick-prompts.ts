import type { AgentToolName } from "@/lib/agent/types";

export type AgentQuickPrompt = {
  id: string;
  tool: AgentToolName;
  label: string;
  prompt: string;
};

export const agentQuickPrompts: AgentQuickPrompt[] = [
  {
    id: "search-arch",
    tool: "search_notes",
    label: "架构笔记",
    prompt: "帮我搜索笔记里关于前端架构治理的内容",
  },
  {
    id: "search-perf",
    tool: "search_notes",
    label: "性能笔记",
    prompt: "检索笔记中与性能优化、Core Web Vitals 相关的内容",
  },
  {
    id: "calc-metric",
    tool: "calculate",
    label: "指标计算",
    prompt: "计算 (3200 - 1800) / 3200 * 100 的结果",
  },
  {
    id: "time-now",
    tool: "current_time",
    label: "服务器时间",
    prompt: "告诉我现在服务器本地时间是几点？",
  },
  {
    id: "multi-step",
    tool: "search_notes",
    label: "多工具串联",
    prompt: "先检索前端架构笔记，再计算 (128 + 64) * 3，并告诉我现在时间",
  },
];

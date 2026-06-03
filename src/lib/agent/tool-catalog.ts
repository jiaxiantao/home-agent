import type { AgentToolName } from "@/lib/agent/types";

export const agentToolCatalog: Array<{
  name: AgentToolName;
  label: string;
  description: string;
  args: Record<string, string>;
}> = [
  {
    name: "search_notes",
    label: "笔记检索",
    description: "用 pg_trgm / memory 引擎搜索知识库笔记",
    args: { query: "string" },
  },
  {
    name: "calculate",
    label: "安全计算器",
    description: "对受限数学表达式求值",
    args: { expression: "string" },
  },
  {
    name: "current_time",
    label: "当前时间",
    description: "返回服务器本地时间",
    args: {},
  },
];

import type { AgentToolName } from "@/lib/agent/types";

export const agentToolCatalog: Array<{
  name: AgentToolName;
  label: string;
  description: string;
  args: Record<string, string>;
}> = [
  {
    name: "list_schema",
    label: "表目录",
    description: "查看大风车分析库核心表与字段说明",
    args: {},
  },
  {
    name: "propose_sql",
    label: "提出 SQL",
    description: "生成待确认的只读 MySQL 查询",
    args: { sql: "string", explanation: "string" },
  },
  {
    name: "execute_sql",
    label: "执行 SQL",
    description: "用户确认后执行只读查询（不可由规划器直接触发）",
    args: { sql: "string" },
  },
  {
    name: "build_chart",
    label: "生成图表",
    description: "根据查询结果生成 bar/line/pie 图表描述",
    args: { columns: "string[]", rows: "object[]", chartType: "bar|line|pie" },
  },
];

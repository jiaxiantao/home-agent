import type { AgentToolName } from "@/lib/agent/types";

export type AgentQuickPrompt = {
  id: string;
  tool: AgentToolName;
  label: string;
  prompt: string;
};

export const agentQuickPrompts: AgentQuickPrompt[] = [
  {
    id: "car-count",
    tool: "propose_sql",
    label: "车源总数",
    prompt: "大风车正式车源一共有多少辆？",
  },
  {
    id: "car-status",
    tool: "propose_sql",
    label: "状态分布",
    prompt: "统计各状态的正式车源数量分布",
  },
  {
    id: "ops-trend",
    tool: "propose_sql",
    label: "运营趋势",
    prompt: "看一下最近运营日报里新增车源和求购的趋势",
  },
  {
    id: "order-count",
    tool: "propose_sql",
    label: "订单总量",
    prompt: "主订单一共有多少（排除已删除）？",
  },
  {
    id: "buy-count",
    tool: "propose_sql",
    label: "求购线索",
    prompt: "正式求购线索总量是多少？",
  },
  {
    id: "schema",
    tool: "list_schema",
    label: "表目录",
    prompt: "列出分析库有哪些核心表和字段？",
  },
  {
    id: "db-list",
    tool: "list_databases",
    label: "有哪些库",
    prompt: "大风车项目现在有哪些数据库？当前连接能看到哪些库？",
  },
  {
    id: "table-list",
    tool: "list_tables",
    label: "matador 表",
    prompt: "matador 库里有哪些表？",
  },
  {
    id: "car-columns",
    tool: "describe_table",
    label: "car 字段",
    prompt: "car 表有哪些字段？每个字段是什么类型？",
  },
];

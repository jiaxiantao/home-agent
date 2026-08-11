import type { AgentToolName } from "@/lib/agent/types";

export type AgentQuickPrompt = {
  id: string;
  tool: AgentToolName;
  label: string;
  prompt: string;
};

export const agentQuickPrompts: AgentQuickPrompt[] = [
  {
    id: "user-by-id",
    tool: "propose_sql",
    label: "查客户",
    prompt: "我想知道客户 id 为 ANwbnMyLF0 的客户信息",
  },
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
];

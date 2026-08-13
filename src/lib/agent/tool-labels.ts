import { agentToolCatalog } from "@/lib/agent/tool-catalog";
import type { AgentToolName } from "@/lib/agent/types";

const labelByTool = new Map<string, string>(
  agentToolCatalog.map((item) => [item.name, item.label]),
);

export function getAgentToolLabel(tool: AgentToolName) {
  return labelByTool.get(tool) ?? tool;
}

export function formatAgentPlanTitle(input: {
  action: "tool" | "answer";
  tool?: AgentToolName;
  reasoning?: string;
}) {
  if (input.action === "answer") {
    return "整理结论";
  }

  if (input.tool) {
    return getAgentToolLabel(input.tool);
  }

  return input.reasoning?.trim() || "执行下一步";
}

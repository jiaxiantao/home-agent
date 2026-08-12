import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { ThreadTurn } from "@/lib/agent/planner";
import { truncatePriorForPlanner } from "@/lib/agent/planner-context";
import type { AgentToolResult } from "@/lib/agent/types";
import { createChatModel, isLangGraphLlmEnabled } from "@/lib/agent/langgraph/model";
import { buildAgentSystemPrompt } from "@/lib/agent/langgraph/prompts";

export async function synthesizeAnswerAfterQuery(input: {
  message: string;
  prior: AgentToolResult[];
  conversation?: ThreadTurn[];
  summary: string;
}): Promise<{ text: string; mock: boolean }> {
  const conversation = input.conversation ?? [];

  if (isLangGraphLlmEnabled()) {
    try {
      const model = createChatModel();
      const response = await model.invoke([
        new SystemMessage(buildAgentSystemPrompt(input.message)),
        ...conversation.slice(-10).map((turn) =>
          turn.role === "user"
            ? new HumanMessage(turn.content)
            : new HumanMessage(`[assistant] ${turn.content}`),
        ),
        new HumanMessage(
          JSON.stringify({
            task: "请仅根据已有工具结果，用简洁中文直接回答用户问题，不要再调用工具。",
            question: input.message,
            priorTools: truncatePriorForPlanner(input.prior),
          }),
        ),
      ]);

      const text =
        typeof response.content === "string" ? response.content.trim() : "";
      if (text) {
        return { text, mock: false };
      }
    } catch {
      // fall through to summary
    }
  }

  return {
    text: `${input.summary}\n\n针对「${input.message}」已完成查询。`,
    mock: true,
  };
}

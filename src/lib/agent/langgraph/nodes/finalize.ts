import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  formatBackendApiAnswer,
  formatSqlAnswer,
  summarizeBackendApiResult,
  summarizeSqlResult,
} from "@/lib/agent/answer-format";
import { suggestFollowUpQuestions } from "@/lib/agent/follow-ups";
import type { ThreadTurn } from "@/lib/agent/planner";
import { truncatePriorForPlanner } from "@/lib/agent/planner-context";
import type { AgentToolResult, ExecuteSqlData } from "@/lib/agent/types";
import type { BackendApiCallResult } from "@/lib/analytics/backend-api-client";
import { createChatModel, isLangGraphLlmEnabled } from "@/lib/agent/langgraph/model";
import { buildAgentSystemPrompt } from "@/lib/agent/langgraph/prompts";

function buildPriorContext(prior: AgentToolResult[]) {
  const apiEntry = [...prior].reverse().find((item) => item.tool === "call_backend_api");
  const apiResult = apiEntry?.data as BackendApiCallResult | undefined;
  if (apiResult?.status === "success" && apiResult.table?.rows.length) {
    return formatBackendApiAnswer(apiResult);
  }

  const sqlEntry = [...prior].reverse().find((item) => item.tool === "execute_sql");
  const sqlResult = sqlEntry?.data as ExecuteSqlData | undefined;
  if (sqlResult) {
    return formatSqlAnswer(sqlResult);
  }

  return JSON.stringify(truncatePriorForPlanner(prior), null, 2);
}

export async function synthesizeAnswerAfterQuery(input: {
  message: string;
  prior: AgentToolResult[];
  conversation?: ThreadTurn[];
  summary: string;
}): Promise<{ text: string; mock: boolean; followUps: string[] }> {
  const conversation = input.conversation ?? [];
  const formattedPrior = buildPriorContext(input.prior);

  let text = "";
  let mock = true;

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
          [
            "请根据下方工具结果，用简洁、可读的中文直接回答用户问题。",
            "要求：",
            "1. 不要复述规划过程或工具名称",
            "2. 优先用自然语言总结关键字段；若适合，可附简短 Markdown 表格",
            "3. 不要再调用工具",
            "",
            `用户问题：${input.message}`,
            `摘要：${input.summary}`,
            "",
            "工具结果：",
            formattedPrior,
          ].join("\n"),
        ),
      ]);

      const content =
        typeof response.content === "string" ? response.content.trim() : "";
      if (content) {
        text = content;
        mock = false;
      }
    } catch {
      // fall through to formatted prior
    }
  }

  if (!text && formattedPrior && formattedPrior !== "[]") {
    text = formattedPrior;
    mock = true;
  }

  if (!text) {
    text = `${input.summary}\n\n针对「${input.message}」已完成查询。`;
    mock = true;
  }

  const suggested = await suggestFollowUpQuestions({
    message: input.message,
    answer: text,
    conversation,
  });

  return {
    text,
    mock,
    followUps: suggested.followUps,
  };
}

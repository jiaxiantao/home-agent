import { HumanMessage, SystemMessage, type AIMessageChunk } from "@langchain/core/messages";

import {
  formatBackendApiAnswer,
  formatSqlAnswer,
} from "@/lib/agent/answer-format";
import { suggestFollowUpQuestions } from "@/lib/agent/follow-ups";
import type { ThreadTurn } from "@/lib/agent/planner";
import { truncatePriorForPlanner } from "@/lib/agent/planner-context";
import type { AgentToolResult, ExecuteSqlData } from "@/lib/agent/types";
import type { BackendApiCallResult } from "@/lib/analytics/backend-api-client";
import { createChatModel, isLangGraphLlmEnabled } from "@/lib/agent/langgraph/model";
import { buildAgentSystemPrompt } from "@/lib/agent/langgraph/prompts";

export type SynthesizedAnswer = {
  text: string;
  mock: boolean;
  followUps: string[];
};

export type SynthesizeAnswerEvent =
  | { kind: "delta"; text: string; delta: string }
  | { kind: "done"; text: string; mock: boolean; followUps: string[] };

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

function extractChunkText(chunk: AIMessageChunk) {
  if (typeof chunk.content === "string") {
    return chunk.content;
  }
  if (Array.isArray(chunk.content)) {
    return chunk.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String(part.text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function fallbackText(input: {
  message: string;
  summary: string;
  formattedPrior: string;
}) {
  if (input.formattedPrior && input.formattedPrior !== "[]") {
    return input.formattedPrior;
  }
  return `${input.summary}\n\n针对「${input.message}」已完成查询。`;
}

export async function* streamSynthesizeAnswerAfterQuery(input: {
  message: string;
  prior: AgentToolResult[];
  conversation?: ThreadTurn[];
  summary: string;
}): AsyncGenerator<SynthesizeAnswerEvent, SynthesizedAnswer> {
  const conversation = input.conversation ?? [];
  const formattedPrior = buildPriorContext(input.prior);

  let text = "";
  let mock = true;

  if (isLangGraphLlmEnabled()) {
    try {
      const model = createChatModel();
      const stream = await model.stream([
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
            "4. 工具结果里若已有记录，必须基于这些记录作答，禁止说「未找到 / 0 条」",
            "",
            `用户问题：${input.message}`,
            `摘要：${input.summary}`,
            "",
            "工具结果：",
            formattedPrior,
          ].join("\n"),
        ),
      ]);

      for await (const chunk of stream) {
        const delta = extractChunkText(chunk);
        if (!delta) {
          continue;
        }
        text += delta;
        yield { kind: "delta", text, delta };
      }

      const trimmed = text.trim();
      if (trimmed) {
        mock = false;
        text = trimmed;
      }
    } catch {
      text = "";
      mock = true;
    }
  }

  if (!text) {
    text = fallbackText({
      message: input.message,
      summary: input.summary,
      formattedPrior,
    });
    mock = true;
    yield { kind: "delta", text, delta: text };
  }

  const suggested = await suggestFollowUpQuestions({
    message: input.message,
    answer: text,
    conversation,
  });

  const result = {
    text,
    mock,
    followUps: suggested.followUps,
  };
  yield { kind: "done", ...result };
  return result;
}

export async function synthesizeAnswerAfterQuery(input: {
  message: string;
  prior: AgentToolResult[];
  conversation?: ThreadTurn[];
  summary: string;
}): Promise<SynthesizedAnswer> {
  let result: SynthesizedAnswer = { text: "", mock: true, followUps: [] };
  for await (const event of streamSynthesizeAnswerAfterQuery(input)) {
    if (event.kind === "done") {
      result = {
        text: event.text,
        mock: event.mock,
        followUps: event.followUps,
      };
    }
  }
  return result;
}

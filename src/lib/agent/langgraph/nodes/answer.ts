import { AIMessage } from "@langchain/core/messages";

import { formatBackendApiAnswers, formatSqlAnswer, summarizeBackendApiResult, summarizeSqlResult } from "@/lib/agent/answer-format";
import { tryDirectAnswer } from "@/lib/agent/direct-answer";
import { suggestFollowUpQuestions } from "@/lib/agent/follow-ups";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import type { ThreadTurn } from "@/lib/agent/planner";
import type { AgentToolResult, AgentTraceEvent, ExecuteSqlData } from "@/lib/agent/types";
import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import {
  answerStreamEvent,
  type SynthesizedAnswer,
} from "@/lib/agent/langgraph/stream-adapter";
import { streamSynthesizeAnswerAfterQuery } from "@/lib/agent/langgraph/nodes/finalize";
import { buildQueryResultSurface } from "@/lib/a2ui/types";
import type { BackendApiCallResult } from "@/lib/analytics/backend-api-client";
import { isSuccessfulBackendApiResult } from "@/lib/analytics/backend-api-client";
import {
  STREAM_HEARTBEAT_MS,
  withIdleHeartbeat,
} from "@/lib/agent/stream-heartbeat";
import { maskFreeTextPii } from "@/lib/security/pii-mask";

export function findSuccessfulBackendApiResults(prior: AgentToolResult[]) {
  return prior
    .filter((item) => item.tool === "call_backend_api")
    .map((item) => item.data as BackendApiCallResult | undefined)
    .filter((item): item is BackendApiCallResult => isSuccessfulBackendApiResult(item));
}

export function findExecuteSqlResult(prior: AgentToolResult[]) {
  const entry = [...prior].reverse().find((item) => item.tool === "execute_sql");
  return entry?.data as ExecuteSqlData | undefined;
}

export function backendApiA2uiEvents(prior: AgentToolResult[]): AgentTraceEvent[] {
  const stamp = Date.now().toString(36);
  return findSuccessfulBackendApiResults(prior).map((apiPreview, index) => ({
    type: "a2ui" as const,
    surface: buildQueryResultSurface({
      surfaceId: `api_${index}_${stamp}`,
      sql: `-- 接口: ${apiPreview.endpointId}`,
      columns: apiPreview.table!.columns,
      rows: apiPreview.table!.rows,
      summary: summarizeBackendApiResult(apiPreview),
    }),
  }));
}

export function answerEvent(input: {
  text: string;
  mock?: boolean;
  followUps?: string[];
}): AgentTraceEvent {
  return {
    type: "answer",
    // 行级遮蔽只管结构化结果，模型自由复述的身份证/银行卡要在出口再挡一次
    text: maskFreeTextPii(input.text),
    mock: input.mock,
    ...(input.followUps?.length ? { followUps: input.followUps } : {}),
  };
}

export async function withFollowUps(input: {
  message: string;
  answer: string;
  conversation: ThreadTurn[];
  mock?: boolean;
  followUps?: string[];
}): Promise<{ answer: string; mock?: boolean; followUps: string[] }> {
  if (input.followUps?.length) {
    return { answer: input.answer, mock: input.mock, followUps: input.followUps };
  }
  const suggested = await suggestFollowUpQuestions({
    message: input.message,
    answer: input.answer,
    conversation: input.conversation,
  });
  return { answer: input.answer, mock: input.mock, followUps: suggested.followUps };
}

export async function* emitAnswerStream(input: {
  message: string;
  prior: AgentToolResult[];
  conversation: ThreadTurn[];
  summary: string;
}): AsyncGenerator<AgentTraceEvent, SynthesizedAnswer> {
  let streamed = "";
  let result: SynthesizedAnswer = { text: "", mock: true, followUps: [] };

  async function* source() {
    yield* streamSynthesizeAnswerAfterQuery(input);
  }

  for await (const item of withIdleHeartbeat(source(), STREAM_HEARTBEAT_MS, () => ({
    kind: "delta" as const,
    text: streamed || "正在整理结论…",
    delta: "",
  }))) {
    if (item.kind === "delta") {
      streamed = item.text || streamed;
      yield answerStreamEvent({ text: streamed, delta: item.delta });
      continue;
    }
    result = { text: item.text, mock: item.mock, followUps: item.followUps };
  }

  return result;
}

function looksLikePlanningReasoning(text: string, state: DfcAgentStateType) {
  if (state.priorToolResults.length === 0) {
    return false;
  }
  if (buildMockPlan(state.userMessage, state.priorToolResults, []).action === "tool") {
    return true;
  }
  return /^(明细查询|业务问数|调用 super-mario|匹配大风车)/.test(text.trim());
}

export function resolveTerminalAnswer(state: DfcAgentStateType) {
  const fromState = state.finalAnswer?.trim();
  if (fromState && !looksLikePlanningReasoning(fromState, state)) {
    return fromState;
  }

  const lastAi = state.messages.findLast((item) => item instanceof AIMessage);
  if (lastAi instanceof AIMessage && typeof lastAi.content === "string") {
    const text = lastAi.content.trim();
    if (text && !looksLikePlanningReasoning(text, state)) {
      return text;
    }
  }

  const sqlResult = findExecuteSqlResult(state.priorToolResults);
  if (sqlResult?.rowCount) {
    return formatSqlAnswer(sqlResult);
  }

  const apiResults = findSuccessfulBackendApiResults(state.priorToolResults);
  if (apiResults.length) {
    return formatBackendApiAnswers(apiResults);
  }

  if (state.priorToolResults.length) {
    return state.priorToolResults.map((item) => `${item.tool}: ${item.output}`).join("\n");
  }

  return "未能完成分析，请重试或换个问法。";
}

/**
 * 生成最终回答。优先级：
 * 1. 结果无歧义（空结果集 / 单行单列标量）→ 直接作答，省掉一次合成调用
 * 2. 有接口或 SQL 结果 → 用小提示词让模型总结
 * 3. 规则规划器已有结论 → 直接用
 * 4. 兜底文本
 */
export async function* streamFinalAnswerFromState(input: {
  state: DfcAgentStateType;
  message: string;
  conversation: ThreadTurn[];
  fallback: string;
}): AsyncGenerator<AgentTraceEvent, { answer: string; mock?: boolean; followUps: string[] }> {
  const { state } = input;

  const direct = tryDirectAnswer(input.message, state.priorToolResults);
  if (direct) {
    yield answerStreamEvent({ text: direct.text, delta: direct.text });
    return withFollowUps({
      message: input.message,
      answer: direct.text,
      conversation: input.conversation,
      mock: true,
    });
  }

  const sqlResult = findExecuteSqlResult(state.priorToolResults);
  if (sqlResult?.rowCount) {
    const synthesized = yield* emitAnswerStream({
      message: input.message,
      prior: state.priorToolResults,
      conversation: input.conversation,
      summary: summarizeSqlResult(sqlResult),
    });
    return {
      answer: synthesized.text || formatSqlAnswer(sqlResult),
      mock: synthesized.mock,
      followUps: synthesized.followUps,
    };
  }

  const apiResults = findSuccessfulBackendApiResults(state.priorToolResults);
  const apiResult = apiResults.at(-1);
  if (apiResult) {
    const summary =
      apiResults.length > 1
        ? `已调用 ${apiResults.length} 个接口并组装结果。`
        : summarizeBackendApiResult(apiResult);
    const synthesized = yield* emitAnswerStream({
      message: input.message,
      prior: state.priorToolResults,
      conversation: input.conversation,
      summary,
    });
    return {
      answer: synthesized.text || formatBackendApiAnswers(apiResults),
      mock: synthesized.mock,
      followUps: synthesized.followUps,
    };
  }

  const mockPlan = buildMockPlan(
    input.message,
    state.priorToolResults,
    input.conversation,
  );
  if (mockPlan.action === "answer" && mockPlan.answer.trim()) {
    yield answerStreamEvent({ text: mockPlan.answer, delta: mockPlan.answer });
    return withFollowUps({
      message: input.message,
      answer: mockPlan.answer,
      conversation: input.conversation,
      mock: true,
    });
  }

  yield answerStreamEvent({ text: input.fallback, delta: input.fallback });
  return withFollowUps({
    message: input.message,
    answer: input.fallback,
    conversation: input.conversation,
    mock: state.mock ?? false,
  });
}

import { AIMessage } from "@langchain/core/messages";

import {
  formatBackendApiAnswers,
  summarizeBackendApiResult,
  summarizeSqlResult,
} from "@/lib/agent/answer-format";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import { resolveApiFallbackPlan } from "@/lib/agent/backend-api-tool-guide";
import type { ThreadTurn } from "@/lib/agent/planner";
import { buildQueryResultSurface, buildSqlConfirmSurface } from "@/lib/a2ui/types";
import { buildChartSpecFromRows } from "@/lib/analytics/chart-spec";
import type { BackendApiCallResult } from "@/lib/analytics/backend-api-client";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";
import {
  fixSqlFromExecutionError,
  sanitizeAgentSql,
} from "@/lib/analytics/sql-sanitize";
import { userRequestedChart, inferPreferredChartType } from "@/lib/agent/chart-intent";
import { getAgentMaxSteps } from "@/lib/agent/config";
import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createGraphInput } from "@/lib/agent/langgraph/graph";
import { createToolsNodeHandler } from "@/lib/agent/langgraph/graph-runner";
import {
  afterToolsRoute,
  agentPlanToStateUpdate,
  buildAgentExhaustedAnswer,
  postToolsNode,
  streamRoutePlannerNode,
  shouldUseTools,
} from "@/lib/agent/langgraph/nodes/plan-or-act";
import {
  streamSynthesizeAnswerAfterQuery,
  type SynthesizedAnswer,
} from "@/lib/agent/langgraph/nodes/finalize";
import { suggestFollowUpQuestions } from "@/lib/agent/follow-ups";
import {
  answerStreamEvent,
  doneEvent,
  emitTerminalError,
  planStreamEvent,
  plannerModeEvent,
  stepMetricEvent,
  tracePlanStep,
} from "@/lib/agent/langgraph/stream-adapter";
import {
  STREAM_HEARTBEAT_MS,
  withIdleHeartbeat,
} from "@/lib/agent/stream-heartbeat";
import {
  runBuildChartTool,
  runExecuteSqlTool,
} from "@/lib/agent/langgraph/tools";
import {
  attachUserToPendingRun,
  createRunId,
  getPendingSqlRun,
  savePendingSqlRun,
  takePendingSqlRun,
  type PendingSqlRun,
} from "@/lib/agent/pending-runs";
import {
  appendThreadMessage,
  ensureThread,
  formatThreadForPlanner,
  getThreadMessages,
} from "@/lib/agent/thread-store";
import {
  createTurnUiRecorder,
  type TurnUiRecorder,
} from "@/lib/agent/thread-ui";
import type {
  AgentResumeAction,
  AgentTraceEvent,
  AgentToolResult,
  ExecuteSqlData,
  ProposeSqlData,
} from "@/lib/agent/types";
import {
  createServerHistory,
  updateServerHistoryByRunId,
} from "@/lib/history/server-history";
import { auditFromContext, type AuditContext } from "@/lib/security/audit-log";
import { assertAllowedDatabases } from "@/lib/security/database-allowlist";
import { assertAllowedTables } from "@/lib/security/table-allowlist";
import {
  isToolAllowedForUser,
  toolAccessDeniedMessage,
} from "@/lib/security/rbac";
import type { SsoCredentials } from "@/lib/security/sso-credentials";
import { getSsoRequestContext } from "@/lib/security/sso-context";
import { resolveLlmProvider } from "@/lib/agent/langgraph/model";
import type { LlmProvider } from "@/lib/llm-providers-catalog";

export type RunDfcAgentLoopOptions = {
  signal?: AbortSignal;
  resume?: AgentResumeAction;
  audit?: AuditContext;
  threadId?: string;
  /** 显式传入请求 SSO，避免 LangGraph/ToolNode 异步边界丢失 ALS */
  sso?: SsoCredentials | null;
  /** 显式传入请求模型，避免心跳/工具异步边界丢失 ALS */
  llmProvider?: LlmProvider;
  /** 本轮 UI 记录器：把图表/分析步骤写入会话，供历史还原 */
  turnUi?: TurnUiRecorder;
  continueFrom?: {
    prior: AgentToolResult[];
    skipAppendUser?: boolean;
    startedAt?: number;
    steps?: number;
    toolCalls?: number;
  };
};


function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }
  throw new Error("Agent request aborted");
}

function validateExecutableSql(rawSql: string) {
  const sanitized = sanitizeAgentSql(rawSql);
  const guarded = assertReadOnlySql(sanitized.sql);
  if (!guarded.ok) {
    throw new Error(guarded.reason);
  }
  const allowlist = assertAllowedTables(guarded.sql);
  if (!allowlist.ok) {
    throw new Error(allowlist.reason);
  }
  const databases = assertAllowedDatabases(guarded.sql);
  if (!databases.ok) {
    throw new Error(databases.reason);
  }
  return guarded.sql;
}

function summarizeQuery(result: ExecuteSqlData) {
  return summarizeSqlResult(result);
}

function findSuccessfulBackendApiResults(prior: AgentToolResult[]) {
  return prior
    .filter((item) => item.tool === "call_backend_api")
    .map((item) => item.data as BackendApiCallResult | undefined)
    .filter(
      (item): item is BackendApiCallResult =>
        Boolean(item?.status === "success" && item.table?.rows.length),
    );
}

function findExecuteSqlResult(prior: AgentToolResult[]) {
  const entry = [...prior].reverse().find((item) => item.tool === "execute_sql");
  return entry?.data as ExecuteSqlData | undefined;
}

function backendApiA2uiEvents(prior: AgentToolResult[]) {
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

async function withFollowUps(input: {
  message: string;
  answer: string;
  conversation: ThreadTurn[];
  mock?: boolean;
  followUps?: string[];
}): Promise<{
  answer: string;
  mock?: boolean;
  followUps: string[];
  apiResult?: BackendApiCallResult;
  sqlResult?: ExecuteSqlData;
}> {
  if (input.followUps?.length) {
    return {
      answer: input.answer,
      mock: input.mock,
      followUps: input.followUps,
    };
  }
  const suggested = await suggestFollowUpQuestions({
    message: input.message,
    answer: input.answer,
    conversation: input.conversation,
  });
  return {
    answer: input.answer,
    mock: input.mock,
    followUps: suggested.followUps,
  };
}

function answerEvent(input: {
  text: string;
  mock?: boolean;
  followUps?: string[];
}): AgentTraceEvent {
  return {
    type: "answer",
    text: input.text,
    mock: input.mock,
    ...(input.followUps?.length ? { followUps: input.followUps } : {}),
  };
}

async function* emitAnswerStream(input: {
  message: string;
  prior: AgentToolResult[];
  conversation: ThreadTurn[];
  summary: string;
}): AsyncGenerator<AgentTraceEvent, SynthesizedAnswer> {
  let streamed = "";
  let result: SynthesizedAnswer = { text: "", mock: true, followUps: [] };

  async function* source() {
    for await (const event of streamSynthesizeAnswerAfterQuery(input)) {
      yield event;
    }
  }

  for await (const item of withIdleHeartbeat(
    source(),
    STREAM_HEARTBEAT_MS,
    () => ({
      kind: "delta" as const,
      text: streamed || "正在整理结论…",
      delta: "",
    }),
  )) {
    if (item.kind === "delta") {
      streamed = item.text || streamed;
      yield answerStreamEvent({ text: streamed, delta: item.delta });
      continue;
    }
    result = {
      text: item.text,
      mock: item.mock,
      followUps: item.followUps,
    };
  }

  return result;
}

async function* streamFinalAnswerFromState(input: {
  state: DfcAgentStateType;
  message: string;
  conversation: ThreadTurn[];
  fallback: string;
}): AsyncGenerator<
  AgentTraceEvent,
  {
    answer: string;
    mock?: boolean;
    followUps: string[];
    apiResult?: BackendApiCallResult;
    sqlResult?: ExecuteSqlData;
  }
> {
  const apiResults = findSuccessfulBackendApiResults(input.state.priorToolResults);
  const apiResult = apiResults.at(-1);
  if (apiResult) {
    const summary =
      apiResults.length > 1
        ? `已调用 ${apiResults.length} 个接口并组装结果。`
        : summarizeBackendApiResult(apiResult);
    const synthesized = yield* emitAnswerStream({
      message: input.message,
      prior: input.state.priorToolResults,
      conversation: input.conversation,
      summary,
    });
    return {
      answer: synthesized.text || formatBackendApiAnswers(apiResults),
      mock: synthesized.mock,
      followUps: synthesized.followUps,
      apiResult,
    };
  }

  const sqlResult = findExecuteSqlResult(input.state.priorToolResults);
  if (sqlResult) {
    const summary = summarizeSqlResult(sqlResult);
    const synthesized = yield* emitAnswerStream({
      message: input.message,
      prior: input.state.priorToolResults,
      conversation: input.conversation,
      summary,
    });
    return {
      answer: synthesized.text || input.fallback,
      mock: synthesized.mock,
      followUps: synthesized.followUps,
      sqlResult,
    };
  }

  const mockPlan = buildMockPlan(
    input.message,
    input.state.priorToolResults,
    input.conversation,
  );
  if (mockPlan.action === "answer" && mockPlan.answer.trim()) {
    yield answerStreamEvent({
      text: mockPlan.answer,
      delta: mockPlan.answer,
    });
    return withFollowUps({
      message: input.message,
      answer: mockPlan.answer,
      conversation: input.conversation,
      mock: true,
    });
  }

  yield answerStreamEvent({
    text: input.fallback,
    delta: input.fallback,
  });
  return withFollowUps({
    message: input.message,
    answer: input.fallback,
    conversation: input.conversation,
    mock: input.state.mock ?? false,
  });
}

async function appendAssistantThreadMessage(
  threadId: string | undefined,
  userId: string | undefined,
  content: string,
  extra?: { sql?: string; turnUi?: TurnUiRecorder },
) {
  if (!threadId || !userId) {
    return;
  }
  const snapshot = extra?.turnUi?.snapshot();
  await appendThreadMessage(threadId, userId, {
    role: "assistant",
    content,
    sql: extra?.sql,
    ts: Date.now(),
    surfaces: snapshot?.surfaces.length ? snapshot.surfaces : undefined,
    steps: snapshot?.steps.length ? snapshot.steps : undefined,
  });
}

function assertPendingOwnership(
  pending: PendingSqlRun,
  currentUserId: string | undefined,
) {
  if (
    pending.userId &&
    currentUserId &&
    pending.userId !== currentUserId
  ) {
    throw new Error("无权确认或取消他人的 SQL 请求");
  }
}

async function* requeueSqlConfirm(
  pending: PendingSqlRun,
  sql: string,
  errorMessage: string,
): AsyncGenerator<AgentTraceEvent> {
  const nextPending: PendingSqlRun = {
    ...pending,
    sql,
    createdAt: Date.now(),
  };
  await savePendingSqlRun(nextPending);

  yield { type: "error", message: errorMessage };
  yield {
    type: "a2ui",
    surface: buildSqlConfirmSurface({
      surfaceId: `retry_${pending.runId}_${Date.now().toString(36)}`,
      runId: pending.runId,
      sql,
      explanation: pending.explanation,
      errorMessage,
    }),
  };
  yield {
    type: "awaiting_input",
    runId: pending.runId,
    reason: "confirm_sql",
    sql,
    explanation: pending.explanation,
  };
}

async function* resumeConfirmedSql(
  resume: AgentResumeAction,
  options: { signal?: AbortSignal; audit?: AuditContext; turnUi?: TurnUiRecorder },
): AsyncGenerator<
  AgentTraceEvent,
  | {
      message: string;
      prior: AgentToolResult[];
      threadId?: string;
      userId?: string;
      startedAt: number;
      steps: number;
      toolCalls: number;
    }
  | undefined
> {
  const startedAt = performance.now();
  const runId = String(resume.payload?.runId ?? "");

  yield { type: "trace", phase: "resume", message: `恢复运行 ${runId || "(missing)"}` };

  if (!runId) {
    yield* emitTerminalError("缺少 runId，无法确认执行", startedAt);
    return;
  }

  const peeked = await getPendingSqlRun(runId);
  if (!peeked) {
    yield* emitTerminalError("待确认的 SQL 已过期或不存在，请重新提问。", startedAt);
    return;
  }

  const currentUserId = options.audit?.user.userId;
  try {
    assertPendingOwnership(peeked, currentUserId);
  } catch (error) {
    yield* emitTerminalError(
      error instanceof Error ? error.message : "无权操作",
      startedAt,
    );
    return;
  }

  if (resume.actionId === "cancel_sql") {
    const cancelled = await takePendingSqlRun(runId);
    auditFromContext(options.audit, {
      event: "sql.cancelled",
      runId,
      outcome: "cancelled",
    });
    if (cancelled?.userId) {
      await updateServerHistoryByRunId(cancelled.userId, runId, {
        status: "cancelled",
      });
    }
    await appendAssistantThreadMessage(
      cancelled?.threadId ?? peeked.threadId,
      cancelled?.userId ?? peeked.userId,
      "已取消 SQL 执行。",
      { turnUi: options.turnUi },
    );
    yield { type: "answer", text: "已取消 SQL 执行。" };
    yield doneEvent(startedAt, 0, 0);
    return;
  }

  if (peeked.threadId) {
    yield { type: "thread", threadId: peeked.threadId };
  }

  assertNotAborted(options.signal);

  let sqlToRun = peeked.sql;
  const editedSql = resume.payload?.sql?.trim();

  try {
    if (editedSql) {
      sqlToRun = validateExecutableSql(editedSql);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "SQL 校验失败";
    yield* requeueSqlConfirm(peeked, editedSql || peeked.sql, message);
    return;
  }

  const pending = await takePendingSqlRun(runId);
  if (!pending) {
    yield* emitTerminalError("待确认的 SQL 已过期或不存在，请重新提问。", startedAt);
    return;
  }

  auditFromContext(options.audit, {
    event: "agent.run.resume",
    runId,
    message: pending.message,
    sql: sqlToRun,
  });
  auditFromContext(options.audit, {
    event: "sql.confirmed",
    runId,
    sql: sqlToRun,
    explanation: pending.explanation,
    outcome: "success",
  });

  const prior = [...pending.prior];
  let toolCalls = 0;
  let steps = 1;

  yield {
    type: "trace",
    phase: "tool",
    message: "用户已确认，开始执行只读 SQL",
  };
  yield { type: "tool_call", tool: "execute_sql", args: { sql: sqlToRun } };
  toolCalls += 1;

  try {
    const toolStartedAt = performance.now();
    const result = await runExecuteSqlTool(sqlToRun);
    const toolMs = Math.round(performance.now() - toolStartedAt);
    prior.push({
      tool: "execute_sql",
      args: { sql: sqlToRun },
      output: result.output,
      data: result.data,
    });
    yield {
      type: "tool_result",
      tool: "execute_sql",
      output: result.output,
      data: result.data,
    };
    yield {
      type: "step_metric",
      step: steps,
      planMs: 0,
      toolMs,
      totalMs: Math.round(performance.now() - startedAt),
    };

    const query = result.data as ExecuteSqlData;
    auditFromContext(options.audit, {
      event: "sql.executed",
      runId,
      sql: query.sql,
      rowCount: query.rowCount,
      latencyMs: toolMs,
      outcome: "success",
    });

    const wantsChart = userRequestedChart(pending.message);
    const chart = wantsChart
      ? buildChartSpecFromRows(query.columns, query.rows, {
          title: "查询结果",
          preferredType: inferPreferredChartType(pending.message),
        })
      : null;

    if (chart) {
      steps += 1;
      yield {
        type: "tool_call",
        tool: "build_chart",
        args: { columns: query.columns, rows: query.rows },
      };
      toolCalls += 1;
      const chartResult = await runBuildChartTool({
        columns: query.columns,
        rows: query.rows,
        title: "查询结果",
        chartType: inferPreferredChartType(pending.message),
      });
      prior.push({
        tool: "build_chart",
        args: { columns: query.columns, rows: query.rows },
        output: chartResult.output,
        data: chartResult.data,
      });
      yield {
        type: "tool_result",
        tool: "build_chart",
        output: chartResult.output,
        data: chartResult.data,
      };
    }

    const summary = summarizeQuery(query);
    yield {
      type: "a2ui",
      surface: buildQueryResultSurface({
        surfaceId: `result_${runId}`,
        sql: query.sql,
        columns: query.columns,
        rows: query.rows,
        chart,
        summary,
      }),
    };

    if (wantsChart && !chart) {
      yield {
        type: "trace",
        phase: "plan",
        message: "当前结果无法生成图表，继续规划分组/区间统计",
      };
      return {
        message: pending.message,
        prior,
        threadId: pending.threadId,
        userId: pending.userId,
        startedAt,
        steps,
        toolCalls,
      };
    }

    yield { type: "trace", phase: "answer", message: "基于查询结果合成最终回答" };

    const synthesized = yield* emitAnswerStream({
      message: pending.message,
      prior,
      conversation: pending.threadId && pending.userId
        ? formatThreadForPlanner(
            await getThreadMessages(pending.threadId, pending.userId),
          )
        : [],
      summary,
    });

    const answerText = synthesized.text;
    await appendAssistantThreadMessage(
      pending.threadId,
      pending.userId,
      answerText,
      { sql: query.sql, turnUi: options.turnUi },
    );

    if (pending.userId) {
      await updateServerHistoryByRunId(pending.userId, runId, {
        status: "done",
        sql: query.sql,
        answer: answerText,
        rowCount: query.rowCount,
      });
    }

    yield answerEvent({
      text: answerText,
      mock: synthesized.mock ?? pending.mock,
      followUps: synthesized.followUps,
    });
    yield doneEvent(startedAt, steps, toolCalls);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SQL 执行失败";
    const autoFix = fixSqlFromExecutionError(sqlToRun, message);
    if (autoFix) {
      auditFromContext(options.audit, {
        event: "sql.execution_failed",
        runId,
        sql: sqlToRun,
        outcome: "failure",
        error: message,
      });

      if (pending.userId) {
        await updateServerHistoryByRunId(pending.userId, runId, {
          status: "awaiting",
          sql: autoFix.sql,
          answer: `已自动修正 SQL：${autoFix.notes.join("；")}`,
        });
      }

      yield* requeueSqlConfirm(
        pending,
        autoFix.sql,
        `执行失败：${message}。已自动移除 API 参数条件（objCode/recordId 不是数据库列），请确认修正后的 SQL 后重试。`,
      );
      return;
    }

    auditFromContext(options.audit, {
      event: "sql.execution_failed",
      runId,
      sql: sqlToRun,
      outcome: "failure",
      error: message,
    });

    if (pending.userId) {
      await updateServerHistoryByRunId(pending.userId, runId, {
        status: "awaiting",
        sql: sqlToRun,
        answer: message,
      });
    }

    yield* requeueSqlConfirm(pending, sqlToRun, message);
  }
}

function resolveTerminalAnswer(state: DfcAgentStateType) {
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

  const apiResults = findSuccessfulBackendApiResults(state.priorToolResults);
  if (apiResults.length) {
    return formatBackendApiAnswers(apiResults);
  }

  if (state.priorToolResults.length) {
    return state.priorToolResults.map((item) => `${item.tool}: ${item.output}`).join("\n");
  }

  return "未能完成分析，请重试或换个问法。";
}

function looksLikePlanningReasoning(text: string, state: DfcAgentStateType) {
  if (state.priorToolResults.length === 0) {
    return false;
  }

  const plan = buildMockPlan(state.userMessage, state.priorToolResults, []);
  if (plan.action === "tool") {
    return true;
  }

  return /^(明细查询|业务问数|调用 super-mario|匹配大风车)/.test(text.trim());
}

function mergeState(
  state: DfcAgentStateType,
  patch: Partial<DfcAgentStateType>,
): DfcAgentStateType {
  return {
    ...state,
    ...patch,
    messages: patch.messages ? [...state.messages, ...patch.messages] : state.messages,
    priorToolResults: patch.priorToolResults
      ? [...state.priorToolResults, ...patch.priorToolResults]
      : state.priorToolResults,
  };
}

/** LangGraph 驱动的 Agent 主循环 */
export async function* runDfcAgentLoop(
  message: string,
  options: RunDfcAgentLoopOptions = {},
): AsyncGenerator<AgentTraceEvent> {
  if (!options.turnUi) {
    const turnUi = createTurnUiRecorder();
    for await (const event of runDfcAgentLoop(message, { ...options, turnUi })) {
      turnUi.record(event);
      yield event;
    }
    return;
  }

  if (options.resume && !options.continueFrom) {
    const continuation = yield* resumeConfirmedSql(options.resume, {
      signal: options.signal,
      audit: options.audit,
      turnUi: options.turnUi,
    });
    if (continuation) {
      yield* runDfcAgentLoop(continuation.message, {
        ...options,
        resume: undefined,
        threadId: continuation.threadId ?? options.threadId,
        continueFrom: {
          ...continuation,
          skipAppendUser: true,
        },
      });
    }
    return;
  }

  const continueFrom = options.continueFrom;
  const startedAt = continueFrom?.startedAt ?? performance.now();
  const llmProvider = resolveLlmProvider(options.llmProvider);
  const userId = options.audit?.user.userId ?? "unknown";
  const thread = await ensureThread(options.threadId, userId);
  yield { type: "thread", threadId: thread.threadId };
  if (!continueFrom) {
    yield { type: "trace", phase: "start", message: "LangGraph Agent 循环启动" };
    yield { type: "trace", phase: "start", message: "加载会话上下文…" };
  }

  if (!continueFrom?.skipAppendUser) {
    await appendThreadMessage(thread.threadId, userId, {
      role: "user",
      content: message,
      ts: Date.now(),
    });
  }

  const conversation = formatThreadForPlanner(
    await getThreadMessages(thread.threadId, userId),
  );

  if (!continueFrom) {
    auditFromContext(options.audit, {
      event: "agent.run.start",
      message,
      outcome: "success",
    });
  }

  const runTools = createToolsNodeHandler(
    options.sso ?? getSsoRequestContext(),
  );
  let state: DfcAgentStateType = createGraphInput(
    message,
    conversation,
    continueFrom?.prior ?? [],
  );
  let steps = continueFrom?.steps ?? 0;
  let toolCalls = continueFrom?.toolCalls ?? 0;
  let lastMock = false;
  const maxSteps = getAgentMaxSteps();

  while (steps < maxSteps) {
    assertNotAborted(options.signal);
    steps += 1;

    yield tracePlanStep(steps);
    yield planStreamEvent({
      step: steps,
      text: "正在规划…",
      delta: "正在规划…",
    });

    const forcedPlan = resolveApiFallbackPlan(message, state.priorToolResults);
    const planStartedAt = performance.now();
    let agentUpdate: Partial<DfcAgentStateType> = {};

    if (forcedPlan) {
      agentUpdate = agentPlanToStateUpdate(forcedPlan, `fallback_${steps}`, state.stepCount);
      lastMock = true;
    } else {
    type PlannerWait =
      | { kind: "delta"; event: AgentTraceEvent }
      | { kind: "done"; update: Partial<DfcAgentStateType> }
      | { kind: "fail"; message: string };

    async function* plannerWaitStream(): AsyncGenerator<PlannerWait> {
      for await (const planEvent of streamRoutePlannerNode(
        state,
        conversation,
        llmProvider,
      )) {
        if (planEvent.kind === "delta") {
          yield {
            kind: "delta",
            event: planStreamEvent({
              step: steps,
              text: planEvent.text,
              delta: planEvent.delta,
            }),
          };
        } else if (planEvent.kind === "fail") {
          yield { kind: "fail", message: planEvent.message };
        } else {
          yield { kind: "done", update: planEvent.update };
        }
      }
    }

    for await (const item of withIdleHeartbeat(
      plannerWaitStream(),
      STREAM_HEARTBEAT_MS,
      (waitedMs) => ({
        kind: "delta" as const,
        event: planStreamEvent({
          step: steps,
          text: `规划进行中… 已等待 ${Math.max(1, Math.round(waitedMs / 1000))} 秒`,
          delta: "",
        }),
      }),
    )) {
      assertNotAborted(options.signal);
      if (item.kind === "fail") {
        yield { type: "trace", phase: "plan", message: item.message };
        await createServerHistory({
          userId,
          threadId: thread.threadId,
          question: message,
          status: "error",
          answer: item.message,
        });
        yield* emitTerminalError(item.message, startedAt, steps, toolCalls);
        return;
      }
      if (item.kind === "done") {
        agentUpdate = item.update;
        break;
      }
      yield item.event;
    }
    }

    lastMock = agentUpdate.mock ?? lastMock;
    state = mergeState(state, agentUpdate);

    const planMs = Math.round(performance.now() - planStartedAt);
    yield plannerModeEvent(lastMock);

    const route = shouldUseTools(state);
    if (route === "__end__") {
      if (steps >= maxSteps && state.priorToolResults.length) {
        const answer = buildAgentExhaustedAnswer(state.priorToolResults, maxSteps);
        const withSuggestions = await withFollowUps({
          message,
          answer,
          conversation,
          mock: lastMock,
        });
        yield {
          type: "plan",
          plan: {
            action: "answer",
            answer: withSuggestions.answer,
            reasoning: "已达步数上限",
          },
        };
        yield stepMetricEvent({ step: steps, planMs, startedAt });
        await appendAssistantThreadMessage(
          thread.threadId,
          userId,
          withSuggestions.answer,
          { turnUi: options.turnUi },
        );
        await createServerHistory({
          userId,
          threadId: thread.threadId,
          question: message,
          status: "done",
          answer: withSuggestions.answer,
        });
        yield answerEvent({
          text: withSuggestions.answer,
          mock: withSuggestions.mock,
          followUps: withSuggestions.followUps,
        });
        yield doneEvent(startedAt, steps, toolCalls);
        return;
      }

      yield { type: "trace", phase: "answer", message: "整理最终回答" };

      const fallback = resolveTerminalAnswer(state);
      for (const event of backendApiA2uiEvents(state.priorToolResults)) {
        yield event;
      }

      const finalized = yield* streamFinalAnswerFromState({
        state,
        message,
        conversation,
        fallback,
      });
      const answer = finalized.answer;

      yield {
        type: "plan",
        plan: {
          action: "answer",
          answer,
          reasoning: lastMock ? "规则规划器完成" : "生成最终回答",
        },
      };
      yield stepMetricEvent({
        step: steps,
        planMs,
        startedAt,
      });
      await appendAssistantThreadMessage(thread.threadId, userId, answer, {
        turnUi: options.turnUi,
      });
      await createServerHistory({
        userId,
        threadId: thread.threadId,
        question: message,
        status: "done",
        answer,
      });
      yield answerEvent({
        text: answer,
        mock: finalized.mock ?? lastMock,
        followUps: finalized.followUps,
      });
      yield doneEvent(startedAt, steps, toolCalls);
      return;
    }

    const lastAi = state.messages.findLast((item) => item instanceof AIMessage) as
      | AIMessage
      | undefined;
    const toolCall = lastAi?.tool_calls?.[0];
    if (!toolCall) {
      break;
    }

    let toolName = toolCall.name as AgentToolResult["tool"];
    let toolArgs = toolCall.args as Record<string, unknown>;
    if (toolName === "execute_sql") {
      toolName = "propose_sql";
      toolArgs = {
        sql: String(toolArgs.sql ?? ""),
        explanation: String(toolArgs.explanation ?? "请确认后执行"),
      };
    }

    yield {
      type: "plan",
      plan: {
        action: "tool",
        tool: toolName,
        args: toolArgs,
        reasoning:
          typeof lastAi.content === "string" ? lastAi.content : "LangGraph 工具调用",
      },
    };

    if (!isToolAllowedForUser(toolName, options.audit?.user.userId)) {
      yield* emitTerminalError(
        toolAccessDeniedMessage(toolName),
        startedAt,
        steps,
        toolCalls,
      );
      return;
    }

    yield { type: "tool_call", tool: toolName, args: toolArgs };
    toolCalls += 1;

    try {
      const toolStartedAt = performance.now();
      type ToolWait =
        | { kind: "result"; update: Partial<DfcAgentStateType> }
        | { kind: "beat"; waitedMs: number };

      async function* toolWaitStream(): AsyncGenerator<ToolWait> {
        yield { kind: "result", update: await runTools(state) };
      }

      let toolUpdate: Partial<DfcAgentStateType> = {};
      for await (const item of withIdleHeartbeat(
        toolWaitStream(),
        STREAM_HEARTBEAT_MS,
        (waitedMs) => ({ kind: "beat" as const, waitedMs }),
      )) {
        assertNotAborted(options.signal);
        if (item.kind === "beat") {
          yield {
            type: "trace",
            phase: "tool",
            message: `${toolName} 执行中… 已等待 ${Math.max(1, Math.round(item.waitedMs / 1000))} 秒`,
          };
          continue;
        }
        toolUpdate = item.update;
      }
      state = mergeState(state, toolUpdate);
      const postUpdate = postToolsNode(state);
      state = mergeState(state, postUpdate);

      const toolMs = Math.round(performance.now() - toolStartedAt);
      const lastResult = state.priorToolResults.at(-1);
      if (lastResult) {
        yield {
          type: "tool_result",
          tool: lastResult.tool,
          output: lastResult.output,
          data: lastResult.data,
        };
      }

      yield stepMetricEvent({
        step: steps,
        planMs,
        toolMs,
        startedAt,
      });

      if (state.pendingSql || lastResult?.tool === "propose_sql") {
        const data = (lastResult?.data ?? state.pendingSql) as ProposeSqlData;
        const runId = createRunId();
        const pending = attachUserToPendingRun(
          {
            runId,
            message,
            prior: state.priorToolResults,
            sql: data.sql,
            explanation: data.explanation,
            createdAt: Date.now(),
            mock: lastMock,
            threadId: thread.threadId,
          },
          options.audit?.user ?? { userId: "unknown", authMode: "disabled" },
          options.audit?.clientIp,
          thread.threadId,
        );

        await savePendingSqlRun(pending);
        auditFromContext(options.audit, {
          event: "sql.proposed",
          runId,
          message,
          sql: data.sql,
          explanation: data.explanation,
          outcome: "success",
        });
        await createServerHistory({
          userId,
          threadId: thread.threadId,
          question: message,
          status: "awaiting",
          sql: data.sql,
          runId,
        });

        yield {
          type: "a2ui",
          surface: buildSqlConfirmSurface({
            surfaceId: `confirm_${runId}`,
            runId,
            sql: data.sql,
            explanation: data.explanation,
          }),
        };
        yield {
          type: "awaiting_input",
          runId,
          reason: "confirm_sql",
          sql: data.sql,
          explanation: data.explanation,
        };
        await appendAssistantThreadMessage(
          thread.threadId,
          userId,
          data.explanation?.trim() || "请确认是否执行查询。",
          { sql: data.sql, turnUi: options.turnUi },
        );
        return;
      }

      const next = afterToolsRoute(state);
      if (next === "__end__") {
        const hasQueryableResults =
          findSuccessfulBackendApiResults(state.priorToolResults).length > 0 ||
          Boolean(findExecuteSqlResult(state.priorToolResults));

        if (state.finalAnswer && hasQueryableResults) {
          for (const event of backendApiA2uiEvents(state.priorToolResults)) {
            yield event;
          }

          const finalized = yield* streamFinalAnswerFromState({
            state,
            message,
            conversation,
            fallback: state.finalAnswer,
          });
          const answer = finalized.answer;

          await appendAssistantThreadMessage(thread.threadId, userId, answer, {
            turnUi: options.turnUi,
          });
          yield answerEvent({
            text: answer,
            mock: finalized.mock ?? lastMock,
            followUps: finalized.followUps,
          });
          yield doneEvent(startedAt, steps, toolCalls);
          return;
        }

        if (state.finalAnswer) {
          const withSuggestions = await withFollowUps({
            message,
            answer: state.finalAnswer,
            conversation,
            mock: lastMock,
          });
          await appendAssistantThreadMessage(
            thread.threadId,
            userId,
            withSuggestions.answer,
            { turnUi: options.turnUi },
          );
          yield answerEvent({
            text: withSuggestions.answer,
            mock: withSuggestions.mock,
            followUps: withSuggestions.followUps,
          });
          yield doneEvent(startedAt, steps, toolCalls);
          return;
        }
        break;
      }
    } catch (error) {
      yield* emitTerminalError(
        error instanceof Error ? error.message : "工具执行失败",
        startedAt,
        steps,
        toolCalls,
      );
      return;
    }
  }

  const exhausted =
    state.finalAnswer ??
    (steps >= maxSteps && state.priorToolResults.length
      ? buildAgentExhaustedAnswer(state.priorToolResults, maxSteps)
      : state.priorToolResults.length
        ? `已达最大步数（${maxSteps}）。\n${state.priorToolResults.map((item) => `${item.tool}: ${item.output}`).join("\n")}`
        : `已达最大步数（${maxSteps}），请缩小问题范围后重试。`);

  const exhaustedWithSuggestions = await withFollowUps({
    message,
    answer: exhausted,
    conversation,
    mock: lastMock,
  });
  await appendAssistantThreadMessage(
    thread.threadId,
    userId,
    exhaustedWithSuggestions.answer,
    { turnUi: options.turnUi },
  );
  yield answerEvent({
    text: exhaustedWithSuggestions.answer,
    mock: exhaustedWithSuggestions.mock,
    followUps: exhaustedWithSuggestions.followUps,
  });
  yield doneEvent(startedAt, steps, toolCalls);
}

export const runAgentLoop = runDfcAgentLoop;

export async function peekPendingSqlRunForTest(runId: string) {
  return getPendingSqlRun(runId);
}

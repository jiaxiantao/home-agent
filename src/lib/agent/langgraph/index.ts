import { summarizeSqlResult } from "@/lib/agent/answer-format";
import { buildQueryResultSurface, buildSqlConfirmSurface, buildExplainResultSurface } from "@/lib/a2ui/types";
import { buildChartSpecFromRows } from "@/lib/analytics/chart-spec";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";
import {
  fixSqlFromExecutionError,
  sanitizeAgentSql,
} from "@/lib/analytics/sql-sanitize";
import { userRequestedChart, inferPreferredChartType } from "@/lib/agent/chart-intent";
import { detectTrendIntent, inferTrendChartType } from "@/lib/agent/trend-intent";
import { getAgentMaxSteps } from "@/lib/agent/config";
import { AgentLoopGuard } from "@/lib/agent/loop-guard";
import { tryDirectAnswer } from "@/lib/agent/direct-answer";
import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { compileDfcAgentGraph, createGraphInput } from "@/lib/agent/langgraph/graph";
import {
  answerEvent,
  emitAnswerStream,
  withFollowUps,
} from "@/lib/agent/langgraph/nodes/answer";
import {
  answerStreamEvent,
  doneEvent,
  emitTerminalError,
  type SynthesizedAnswer,
} from "@/lib/agent/langgraph/stream-adapter";
import { runBuildChartTool, runExecuteSqlTool } from "@/lib/agent/langgraph/tools";
import {
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
  shouldSkipDuplicateThreadMessage,
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
} from "@/lib/agent/types";
import {
  createServerHistory,
  updateServerHistoryByRunId,
} from "@/lib/history/server-history";
import { auditFromContext, type AuditContext } from "@/lib/security/audit-log";
import { assertAllowedDatabases } from "@/lib/security/database-allowlist";
import { assertAllowedTables } from "@/lib/security/table-allowlist";
import { maskFreeTextPii } from "@/lib/security/pii-mask";
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
    content: maskFreeTextPii(content),
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
  if (pending.userId && currentUserId && pending.userId !== currentUserId) {
    throw new Error("无权确认或取消他人的 SQL 请求");
  }
}

async function* requeueSqlConfirm(
  pending: PendingSqlRun,
  sql: string,
  errorMessage: string,
): AsyncGenerator<AgentTraceEvent> {
  await savePendingSqlRun({ ...pending, sql, createdAt: Date.now() });

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

  if (resume.actionId === "explain_sql") {
    let sqlToExplain = peeked.sql;
    const editedSql = resume.payload?.sql?.trim();
    if (editedSql) {
      try {
        sqlToExplain = validateExecutableSql(editedSql);
      } catch (error) {
        const message = error instanceof Error ? error.message : "SQL 校验失败";
        yield* requeueSqlConfirm(peeked, editedSql || peeked.sql, message);
        return;
      }
    }

    yield { type: "trace", phase: "tool", message: "正在执行 EXPLAIN 查询计划…" };

    try {
      const explainResult = await runExecuteSqlTool(`EXPLAIN ${sqlToExplain}`);
      const query = explainResult.data as ExecuteSqlData;

      yield {
        type: "a2ui",
        surface: buildExplainResultSurface({
          surfaceId: `explain_${runId}_${Date.now().toString(36)}`,
          runId,
          sql: sqlToExplain,
          explanation: peeked.explanation,
          explainColumns: query.columns,
          explainRows: query.rows,
        }),
      };
      yield {
        type: "awaiting_input",
        runId,
        reason: "confirm_sql",
        sql: sqlToExplain,
        explanation: peeked.explanation,
      };

      await savePendingSqlRun({ ...peeked, sql: sqlToExplain, createdAt: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "EXPLAIN 执行失败";
      yield* requeueSqlConfirm(peeked, sqlToExplain, `EXPLAIN 失败：${message}`);
    }
    return;
  }

  if (resume.actionId === "regenerate_sql") {
    await savePendingSqlRun({ ...peeked, createdAt: Date.now() });
    const reason = resume.payload?.reason?.trim() || "";
    const regenerateMessage = reason
      ? `请重新生成 SQL 来回答「${peeked.message}」。用户不满意之前的方案，原因：${reason}。之前的 SQL：${peeked.sql}`
      : `请重新生成 SQL 来回答「${peeked.message}」。用户不满意之前的方案，请换一种查询思路。之前的 SQL：${peeked.sql}`;

    yield { type: "trace", phase: "plan", message: "用户要求重新生成 SQL，重新进入规划…" };

    return {
      message: regenerateMessage,
      prior: peeked.prior,
      threadId: peeked.threadId,
      userId: peeked.userId,
      startedAt,
      steps: 0,
      toolCalls: 0,
    };
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

  yield { type: "trace", phase: "tool", message: "用户已确认，开始执行只读 SQL" };
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

    const trendIntent = detectTrendIntent(pending.message);
    const wantsChart = userRequestedChart(pending.message) || trendIntent !== null;
    const preferredType = trendIntent
      ? inferTrendChartType(trendIntent)
      : inferPreferredChartType(pending.message);
    const chart = wantsChart
      ? buildChartSpecFromRows(query.columns, query.rows, {
          title: trendIntent ? (trendIntent.kind === "comparison" ? trendIntent.vsLabel : "趋势分析") : "查询结果",
          preferredType,
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

    const summary = summarizeSqlResult(query);
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

    const conversation =
      pending.threadId && pending.userId
        ? formatThreadForPlanner(
            await getThreadMessages(pending.threadId, pending.userId),
          )
        : [];

    // 结果无歧义时跳过合成调用
    const direct = tryDirectAnswer(pending.message, prior);
    let synthesized: SynthesizedAnswer;
    if (direct) {
      yield { type: "trace", phase: "answer", message: "结果无歧义，直接作答" };
      yield answerStreamEvent({ text: direct.text, delta: direct.text });
      const suggestions = await withFollowUps({
        message: pending.message,
        answer: direct.text,
        conversation,
        mock: true,
      });
      synthesized = { text: direct.text, mock: true, followUps: suggestions.followUps };
    } else {
      yield { type: "trace", phase: "answer", message: "基于查询结果合成最终回答" };
      synthesized = yield* emitAnswerStream({
        message: pending.message,
        prior,
        conversation,
        summary,
      });
    }

    const answerText = synthesized.text;
    await appendAssistantThreadMessage(pending.threadId, pending.userId, answerText, {
      sql: query.sql,
      turnUi: options.turnUi,
    });

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

    auditFromContext(options.audit, {
      event: "sql.execution_failed",
      runId,
      sql: sqlToRun,
      outcome: "failure",
      error: message,
    });

    if (autoFix) {
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

/**
 * Agent 主入口。真正的推理循环由编译后的 LangGraph 执行，
 * 这里只负责：会话/审计准备、把图的 custom 事件转成 SSE、以及运行结束后的收尾。
 */
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
        continueFrom: { ...continuation, skipAppendUser: true },
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
    const messages = await getThreadMessages(thread.threadId, userId);
    if (
      !shouldSkipDuplicateThreadMessage(messages, {
        role: "user",
        content: message,
      })
    ) {
      await appendThreadMessage(thread.threadId, userId, {
        role: "user",
        content: message,
        ts: Date.now(),
      });
    }
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

  assertNotAborted(options.signal);

  let awaitingInput = false;

  const graph = compileDfcAgentGraph({
    conversation,
    llmProvider,
    sso: options.sso ?? getSsoRequestContext(),
    guard: new AgentLoopGuard(),
    startedAt,
    signal: options.signal,
    // 恢复运行时 prior 已带上首轮的路由结果，无需再预取
    preRetrieve: !continueFrom,
    threadId: thread.threadId,
    userId,
    audit: options.audit,
    onFinalAnswer: async (answer) => {
      await appendAssistantThreadMessage(thread.threadId, userId, answer.text, {
        turnUi: options.turnUi,
      });
      await createServerHistory({
        userId,
        threadId: thread.threadId,
        question: message,
        status: "done",
        answer: answer.text,
      });
    },
    onAwaitingInput: async (pause) => {
      awaitingInput = true;
      await appendAssistantThreadMessage(
        thread.threadId,
        userId,
        pause.explanation?.trim() || "请确认是否执行查询。",
        { sql: pause.sql, turnUi: options.turnUi },
      );
    },
  });

  const input = createGraphInput(message, conversation, continueFrom?.prior ?? []);

  let finalState: DfcAgentStateType | undefined;

  // recursionLimit 只是硬上限；正常收敛由 stepCount 与 afterToolsRoute 负责
  const stream = await graph.stream(input, {
    streamMode: ["custom", "values"],
    recursionLimit: getAgentMaxSteps() * 4 + 10,
    signal: options.signal,
  });

  for await (const [mode, chunk] of stream as AsyncIterable<
    [string, AgentTraceEvent | DfcAgentStateType]
  >) {
    if (mode === "custom") {
      yield chunk as AgentTraceEvent;
      continue;
    }
    finalState = chunk as DfcAgentStateType;
  }

  const steps = finalState?.stepCount ?? continueFrom?.steps ?? 0;
  const toolCalls =
    (finalState?.toolCallCount ?? 0) + (continueFrom?.toolCalls ?? 0);

  if (finalState?.terminalError) {
    await createServerHistory({
      userId,
      threadId: thread.threadId,
      question: message,
      status: "error",
      answer: finalState.terminalError,
    });
    yield* emitTerminalError(finalState.terminalError, startedAt, steps, toolCalls);
    return;
  }

  // HITL 挂起：本次运行没有结论，等待用户确认后由新一次请求继续
  if (awaitingInput || finalState?.awaitingInput) {
    return;
  }

  yield doneEvent(startedAt, steps, toolCalls);
}

export const runAgentLoop = runDfcAgentLoop;

export async function peekPendingSqlRunForTest(runId: string) {
  return getPendingSqlRun(runId);
}

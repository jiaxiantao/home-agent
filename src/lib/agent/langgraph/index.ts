import { AIMessage } from "@langchain/core/messages";

import { buildQueryResultSurface, buildSqlConfirmSurface } from "@/lib/a2ui/types";
import { buildChartSpecFromRows } from "@/lib/analytics/chart-spec";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";
import {
  fixSqlFromExecutionError,
  sanitizeAgentSql,
} from "@/lib/analytics/sql-sanitize";
import { userRequestedChart } from "@/lib/agent/chart-intent";
import { getAgentMaxSteps } from "@/lib/agent/config";
import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createGraphInput } from "@/lib/agent/langgraph/graph";
import { createToolsNodeHandler } from "@/lib/agent/langgraph/graph-runner";
import {
  afterToolsRoute,
  postToolsNode,
  streamRoutePlannerNode,
  shouldUseTools,
} from "@/lib/agent/langgraph/nodes/plan-or-act";
import { synthesizeAnswerAfterQuery } from "@/lib/agent/langgraph/nodes/finalize";
import {
  doneEvent,
  emitTerminalError,
  planStreamEvent,
  plannerModeEvent,
  stepMetricEvent,
  tracePlanStep,
} from "@/lib/agent/langgraph/stream-adapter";
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

export type RunDfcAgentLoopOptions = {
  signal?: AbortSignal;
  resume?: AgentResumeAction;
  audit?: AuditContext;
  threadId?: string;
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
  if (result.rowCount === 0) {
    return "查询成功，但没有返回数据行。";
  }
  if (result.rowCount === 1 && result.columns.length === 1) {
    const key = result.columns[0]!;
    return `查询成功：${key} = ${String(result.rows[0]?.[key])}`;
  }
  return `查询成功，返回 ${result.rowCount} 行${result.truncated ? "（已截断到上限）" : ""}。`;
}

async function appendAssistantThreadMessage(
  threadId: string | undefined,
  userId: string | undefined,
  content: string,
  sql?: string,
) {
  if (!threadId || !userId) {
    return;
  }
  await appendThreadMessage(threadId, userId, {
    role: "assistant",
    content,
    sql,
    ts: Date.now(),
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
  options: { signal?: AbortSignal; audit?: AuditContext },
): AsyncGenerator<AgentTraceEvent> {
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

    yield { type: "trace", phase: "answer", message: "基于查询结果合成最终回答" };

    const synthesized = await synthesizeAnswerAfterQuery({
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
      query.sql,
    );

    if (pending.userId) {
      await updateServerHistoryByRunId(pending.userId, runId, {
        status: "done",
        sql: query.sql,
        answer: answerText,
        rowCount: query.rowCount,
      });
    }

    yield {
      type: "answer",
      text: answerText,
      mock: synthesized.mock ?? pending.mock,
    };
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
  if (options.resume) {
    yield* resumeConfirmedSql(options.resume, {
      signal: options.signal,
      audit: options.audit,
    });
    return;
  }

  const startedAt = performance.now();
  const userId = options.audit?.user.userId ?? "unknown";
  const thread = await ensureThread(options.threadId, userId);
  yield { type: "thread", threadId: thread.threadId };

  await appendThreadMessage(thread.threadId, userId, {
    role: "user",
    content: message,
    ts: Date.now(),
  });

  const conversation = formatThreadForPlanner(
    await getThreadMessages(thread.threadId, userId),
  );

  auditFromContext(options.audit, {
    event: "agent.run.start",
    message,
    outcome: "success",
  });

  yield { type: "trace", phase: "start", message: "LangGraph Agent 循环启动" };

  const runTools = createToolsNodeHandler();
  let state: DfcAgentStateType = createGraphInput(message, conversation);
  let steps = 0;
  let toolCalls = 0;
  let lastMock = false;
  const maxSteps = getAgentMaxSteps();

  while (steps < maxSteps) {
    assertNotAborted(options.signal);
    steps += 1;

    yield tracePlanStep(steps);

    const planStartedAt = performance.now();
    let agentUpdate: Partial<DfcAgentStateType> = {};
    for await (const planEvent of streamRoutePlannerNode(state, conversation)) {
      assertNotAborted(options.signal);
      if (planEvent.kind === "delta") {
        yield planStreamEvent({
          step: steps,
          text: planEvent.text,
          delta: planEvent.delta,
        });
      } else {
        agentUpdate = planEvent.update;
      }
    }
    lastMock = agentUpdate.mock ?? lastMock;
    state = mergeState(state, agentUpdate);

    const planMs = Math.round(performance.now() - planStartedAt);
    yield plannerModeEvent(lastMock);

    const route = shouldUseTools(state);
    if (route === "__end__") {
      const answer =
        state.finalAnswer ??
        (typeof state.messages.at(-1)?.content === "string"
          ? String(state.messages.at(-1)?.content)
          : "已完成分析。");

      yield {
        type: "plan",
        plan: { action: "answer", answer, reasoning: "LangGraph 完成" },
      };
      yield stepMetricEvent({
        step: steps,
        planMs,
        startedAt,
      });
      await appendAssistantThreadMessage(thread.threadId, userId, answer);
      await createServerHistory({
        userId,
        threadId: thread.threadId,
        question: message,
        status: "done",
        answer,
      });
      yield { type: "answer", text: answer, mock: lastMock };
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
      const toolUpdate = await runTools(state);
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
        return;
      }

      const next = afterToolsRoute(state);
      if (next === "__end__") {
        if (state.finalAnswer) {
          await appendAssistantThreadMessage(thread.threadId, userId, state.finalAnswer);
          yield { type: "answer", text: state.finalAnswer, mock: lastMock };
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
    (state.priorToolResults.length
      ? `已达最大步数（${maxSteps}）。\n${state.priorToolResults.map((item) => `${item.tool}: ${item.output}`).join("\n")}`
      : `已达最大步数（${maxSteps}），请缩小问题范围后重试。`);

  await appendAssistantThreadMessage(thread.threadId, userId, exhausted);
  yield { type: "answer", text: exhausted, mock: lastMock };
  yield doneEvent(startedAt, steps, toolCalls);
}

export const runAgentLoop = runDfcAgentLoop;

export async function peekPendingSqlRunForTest(runId: string) {
  return getPendingSqlRun(runId);
}

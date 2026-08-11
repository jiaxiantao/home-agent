import { buildQueryResultSurface, buildSqlConfirmSurface } from "@/lib/a2ui/types";
import { buildChartSpecFromRows } from "@/lib/analytics/chart-spec";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";
import { getAgentMaxSteps } from "@/lib/agent/config";
import {
  attachUserToPendingRun,
  createRunId,
  getPendingSqlRun,
  savePendingSqlRun,
  takePendingSqlRun,
  type PendingSqlRun,
} from "@/lib/agent/pending-runs";
import { planAgentStep } from "@/lib/agent/planner";
import {
  appendThreadMessage,
  ensureThread,
  formatThreadForPlanner,
  getThreadMessages,
} from "@/lib/agent/thread-store";
import { executeAgentTool } from "@/lib/agent/tools";
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
import { assertAllowedTables } from "@/lib/security/table-allowlist";
import {
  isToolAllowedForUser,
  toolAccessDeniedMessage,
} from "@/lib/security/rbac";

function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  throw new Error("Agent request aborted");
}

function buildExhaustedAnswer(prior: AgentToolResult[], maxSteps: number) {
  if (!prior.length) {
    return `已达最大步数（${maxSteps}），请缩小问题范围后重试。`;
  }

  const context = prior.map((item) => `${item.tool}: ${item.output}`).join("\n");
  return `已达最大步数（${maxSteps}）。基于已有工具结果：\n${context}\n\n请缩小问题范围后重试。`;
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

function validateExecutableSql(rawSql: string) {
  const guarded = assertReadOnlySql(rawSql);

  if (!guarded.ok) {
    throw new Error(guarded.reason);
  }

  const allowlist = assertAllowedTables(guarded.sql);

  if (!allowlist.ok) {
    throw new Error(allowlist.reason);
  }

  return guarded.sql;
}

function doneEvent(
  startedAt: number,
  steps: number,
  toolCalls: number,
): AgentTraceEvent {
  return {
    type: "done",
    steps,
    toolCalls,
    totalMs: Math.round(performance.now() - startedAt),
  };
}

async function* emitTerminalError(
  message: string,
  startedAt: number,
  steps = 0,
  toolCalls = 0,
): AsyncGenerator<AgentTraceEvent> {
  yield { type: "error", message };
  yield doneEvent(startedAt, steps, toolCalls);
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

async function synthesizeAnswerAfterQuery(input: {
  message: string;
  prior: AgentToolResult[];
  threadId?: string;
  userId?: string;
  summary: string;
  mock?: boolean;
}) {
  let conversation: Array<{ role: "user" | "assistant"; content: string; sql?: string }> =
    [];

  if (input.threadId && input.userId) {
    conversation = formatThreadForPlanner(
      await getThreadMessages(input.threadId, input.userId),
    );
  }

  try {
    const { plan, mock } = await planAgentStep(
      `请仅根据已有工具结果，用简洁中文直接回答用户问题，不要再调用工具。用户问题：${input.message}`,
      input.prior,
      conversation,
    );

    if (plan.action === "answer" && plan.answer.trim()) {
      return { text: plan.answer.trim(), mock };
    }
  } catch {
    // fall through to template summary
  }

  return {
    text: `${input.summary}\n\n针对「${input.message}」已完成查询。`,
    mock: input.mock,
  };
}

export type RunAgentLoopOptions = {
  signal?: AbortSignal;
  resume?: AgentResumeAction;
  audit?: AuditContext;
  threadId?: string;
};

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
    yield* emitTerminalError(
      "待确认的 SQL 已过期或不存在，请重新提问。",
      startedAt,
    );
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
    // 未 take：pending 仍在，重新展示可编辑确认卡
    yield* requeueSqlConfirm(
      peeked,
      editedSql || peeked.sql,
      message,
    );
    return;
  }

  const pending = await takePendingSqlRun(runId);

  if (!pending) {
    yield* emitTerminalError(
      "待确认的 SQL 已过期或不存在，请重新提问。",
      startedAt,
    );
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
  yield {
    type: "tool_call",
    tool: "execute_sql",
    args: { sql: sqlToRun },
  };
  toolCalls += 1;

  try {
    const toolStartedAt = performance.now();
    const result = await executeAgentTool("execute_sql", { sql: sqlToRun });
    const toolMs = Math.round(performance.now() - toolStartedAt);
    prior.push(result);
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

    const chart = buildChartSpecFromRows(query.columns, query.rows, {
      title: "查询结果",
    });

    if (chart) {
      steps += 1;
      yield {
        type: "tool_call",
        tool: "build_chart",
        args: { columns: query.columns, rows: query.rows },
      };
      toolCalls += 1;
      const chartResult = await executeAgentTool("build_chart", {
        columns: query.columns,
        rows: query.rows,
        title: "查询结果",
      });
      prior.push(chartResult);
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

    yield {
      type: "trace",
      phase: "answer",
      message: "基于查询结果合成最终回答",
    };

    const synthesized = await synthesizeAnswerAfterQuery({
      message: pending.message,
      prior,
      threadId: pending.threadId,
      userId: pending.userId,
      summary,
      mock: pending.mock,
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

    // 归还 pending，允许用户改 SQL 后重试
    yield* requeueSqlConfirm(pending, sqlToRun, message);
  }
}

export async function* runAgentLoop(
  message: string,
  options: RunAgentLoopOptions = {},
): AsyncGenerator<AgentTraceEvent> {
  if (options.resume) {
    yield* resumeConfirmedSql(options.resume, {
      signal: options.signal,
      audit: options.audit,
    });
    return;
  }

  const startedAt = performance.now();
  const prior: AgentToolResult[] = [];
  let steps = 0;
  let toolCalls = 0;
  let lastMock = false;
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

  yield { type: "trace", phase: "start", message: "数据分析 Agent 循环启动" };

  const maxSteps = getAgentMaxSteps();

  while (steps < maxSteps) {
    assertNotAborted(options.signal);
    steps += 1;
    yield {
      type: "trace",
      phase: "plan",
      message: `第 ${steps} 步：规划是否需要工具`,
    };

    const planStartedAt = performance.now();
    const { plan, mock } = await planAgentStep(message, prior, conversation);
    lastMock = mock;
    const planMs = Math.round(performance.now() - planStartedAt);
    yield {
      type: "planner_mode",
      mock,
      label: mock ? "规则规划器（LLM 未启用或调用失败）" : "LLM 规划器",
    };
    yield { type: "plan", plan };

    if (plan.action === "answer") {
      yield {
        type: "step_metric",
        step: steps,
        planMs,
        totalMs: Math.round(performance.now() - startedAt),
      };

      await appendAssistantThreadMessage(thread.threadId, userId, plan.answer);
      await createServerHistory({
        userId,
        threadId: thread.threadId,
        question: message,
        status: "done",
        answer: plan.answer,
      });

      yield { type: "answer", text: plan.answer, mock };
      yield doneEvent(startedAt, steps, toolCalls);
      return;
    }

    let toolName = plan.tool;
    let toolArgs = plan.args;

    if (toolName === "execute_sql") {
      toolName = "propose_sql";
      toolArgs = {
        sql: String(toolArgs.sql ?? ""),
        explanation: String(toolArgs.explanation ?? "请确认后执行"),
      };
    }

    if (
      !isToolAllowedForUser(toolName, options.audit?.user.userId)
    ) {
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
      const result = await executeAgentTool(toolName, toolArgs);
      const toolMs = Math.round(performance.now() - toolStartedAt);
      prior.push(result);
      yield {
        type: "tool_result",
        tool: toolName,
        output: result.output,
        data: result.data,
      };
      yield {
        type: "step_metric",
        step: steps,
        planMs,
        toolMs,
        totalMs: Math.round(performance.now() - startedAt),
      };

      if (toolName === "propose_sql") {
        const data = result.data as ProposeSqlData;
        const runId = createRunId();
        const pending = attachUserToPendingRun(
          {
            runId,
            message,
            prior,
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
    } catch (error) {
      yield* emitTerminalError(
        error instanceof Error ? error.message : "工具执行失败",
        startedAt,
        steps,
        toolCalls,
      );
      return;
    }

    if (steps >= maxSteps) {
      break;
    }
  }

  yield {
    type: "trace",
    phase: "limit",
    message: `已达最大步数（${maxSteps}），合成最终回答`,
  };

  const exhausted = buildExhaustedAnswer(prior, maxSteps);
  await appendAssistantThreadMessage(thread.threadId, userId, exhausted);

  yield { type: "answer", text: exhausted, mock: lastMock };
  yield doneEvent(startedAt, steps, toolCalls);
}

/** 供测试：查看 pending 是否存在 */
export async function peekPendingSqlRunForTest(runId: string) {
  return getPendingSqlRun(runId);
}

import { buildQueryResultSurface, buildSqlConfirmSurface } from "@/lib/a2ui/types";
import { buildChartSpecFromRows } from "@/lib/analytics/chart-spec";
import { getAgentMaxSteps } from "@/lib/agent/config";
import {
  createRunId,
  getPendingSqlRun,
  savePendingSqlRun,
  takePendingSqlRun,
} from "@/lib/agent/pending-runs";
import { planAgentStep } from "@/lib/agent/planner";
import { executeAgentTool } from "@/lib/agent/tools";
import type {
  AgentResumeAction,
  AgentTraceEvent,
  AgentToolResult,
  ExecuteSqlData,
  ProposeSqlData,
} from "@/lib/agent/types";

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

export type RunAgentLoopOptions = {
  signal?: AbortSignal;
  resume?: AgentResumeAction;
};

async function* resumeConfirmedSql(
  resume: AgentResumeAction,
  options: { signal?: AbortSignal },
): AsyncGenerator<AgentTraceEvent> {
  const startedAt = performance.now();
  const runId = String(resume.payload?.runId ?? "");

  yield { type: "trace", phase: "resume", message: `恢复运行 ${runId || "(missing)"}` };

  if (!runId) {
    yield { type: "error", message: "缺少 runId，无法确认执行" };
    return;
  }

  if (resume.actionId === "cancel_sql") {
    takePendingSqlRun(runId);
    yield { type: "answer", text: "已取消 SQL 执行。" };
    yield {
      type: "done",
      steps: 0,
      toolCalls: 0,
      totalMs: Math.round(performance.now() - startedAt),
    };
    return;
  }

  const pending = takePendingSqlRun(runId);

  if (!pending) {
    yield {
      type: "error",
      message: "待确认的 SQL 已过期或不存在，请重新提问。",
    };
    return;
  }

  assertNotAborted(options.signal);

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
    args: { sql: pending.sql },
  };
  toolCalls += 1;

  try {
    const toolStartedAt = performance.now();
    const result = await executeAgentTool("execute_sql", { sql: pending.sql });
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
      type: "answer",
      text: `${summary}\n\n针对「${pending.message}」已完成查询。`,
      mock: pending.mock,
    };
    yield {
      type: "done",
      steps,
      toolCalls,
      totalMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "SQL 执行失败",
    };
  }
}

export async function* runAgentLoop(
  message: string,
  options: RunAgentLoopOptions = {},
): AsyncGenerator<AgentTraceEvent> {
  if (options.resume) {
    yield* resumeConfirmedSql(options.resume, { signal: options.signal });
    return;
  }

  const startedAt = performance.now();
  const prior: AgentToolResult[] = [];
  let steps = 0;
  let toolCalls = 0;
  let lastMock = false;

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
    const { plan, mock } = await planAgentStep(message, prior);
    lastMock = mock;
    const planMs = Math.round(performance.now() - planStartedAt);
    yield { type: "plan", plan };

    if (plan.action === "answer") {
      yield {
        type: "step_metric",
        step: steps,
        planMs,
        totalMs: Math.round(performance.now() - startedAt),
      };
      yield { type: "answer", text: plan.answer, mock };
      yield {
        type: "done",
        steps,
        toolCalls,
        totalMs: Math.round(performance.now() - startedAt),
      };
      return;
    }

    let toolName = plan.tool;
    let toolArgs = plan.args;

    // Block planner-initiated execute_sql; force propose path.
    if (toolName === "execute_sql") {
      toolName = "propose_sql";
      toolArgs = {
        sql: String(toolArgs.sql ?? ""),
        explanation: String(toolArgs.explanation ?? "请确认后执行"),
      };
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
        savePendingSqlRun({
          runId,
          message,
          prior,
          sql: data.sql,
          explanation: data.explanation,
          createdAt: Date.now(),
          mock: lastMock,
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
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "工具执行失败",
      };
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

  yield { type: "answer", text: buildExhaustedAnswer(prior, maxSteps), mock: lastMock };
  yield {
    type: "done",
    steps,
    toolCalls,
    totalMs: Math.round(performance.now() - startedAt),
  };
}

/** 供测试：查看 pending 是否存在 */
export function peekPendingSqlRunForTest(runId: string) {
  return getPendingSqlRun(runId);
}

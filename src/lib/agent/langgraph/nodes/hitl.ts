import { buildSqlConfirmSurface } from "@/lib/a2ui/types";
import {
  attachUserToPendingRun,
  createRunId,
  savePendingSqlRun,
} from "@/lib/agent/pending-runs";
import type { AgentToolResult, AgentTraceEvent, ProposeSqlData } from "@/lib/agent/types";
import { createServerHistory } from "@/lib/history/server-history";
import { auditFromContext, type AuditContext } from "@/lib/security/audit-log";

/**
 * propose_sql 之后的人工确认挂起。
 *
 * 这里不用 LangGraph 的 interrupt()：确认动作跨 HTTP 请求，interrupt 需要
 * 一个分布式 checkpointer 才能在多实例下恢复，而现有的 Redis pending-run
 * 已经提供了持久化、TTL 和 assertPendingOwnership 的归属校验。
 * 图在这里正常收敛到 END，恢复时以 prior 结果重新进图。
 */

export type HitlDeps = {
  message: string;
  threadId: string;
  userId: string;
  clientIp?: string;
  audit?: AuditContext;
  mock?: boolean;
};

export type HitlPause = {
  runId: string;
  sql: string;
  explanation: string;
  events: AgentTraceEvent[];
};

export async function pauseForSqlConfirmation(
  data: ProposeSqlData,
  prior: AgentToolResult[],
  deps: HitlDeps,
): Promise<HitlPause> {
  const runId = createRunId();
  const pending = attachUserToPendingRun(
    {
      runId,
      message: deps.message,
      prior,
      sql: data.sql,
      explanation: data.explanation,
      createdAt: Date.now(),
      mock: deps.mock ?? false,
      threadId: deps.threadId,
    },
    deps.audit?.user ?? { userId: deps.userId, authMode: "disabled" },
    deps.clientIp,
    deps.threadId,
  );

  await savePendingSqlRun(pending);
  auditFromContext(deps.audit, {
    event: "sql.proposed",
    runId,
    message: deps.message,
    sql: data.sql,
    explanation: data.explanation,
    outcome: "success",
  });
  await createServerHistory({
    userId: deps.userId,
    threadId: deps.threadId,
    question: deps.message,
    status: "awaiting",
    sql: data.sql,
    runId,
  });

  return {
    runId,
    sql: data.sql,
    explanation: data.explanation,
    events: [
      {
        type: "a2ui",
        surface: buildSqlConfirmSurface({
          surfaceId: `confirm_${runId}`,
          runId,
          sql: data.sql,
          explanation: data.explanation,
        }),
      },
      {
        type: "awaiting_input",
        runId,
        reason: "confirm_sql",
        sql: data.sql,
        explanation: data.explanation,
      },
    ],
  };
}

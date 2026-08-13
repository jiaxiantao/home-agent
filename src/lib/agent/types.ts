import type { A2UISurface } from "@/lib/a2ui/types";
import type { ChartSpec } from "@/lib/analytics/chart-spec";
import type { QueryResult } from "@/lib/analytics/run-query";

export type AgentToolName =
  | "list_project_databases"
  | "list_databases"
  | "list_tables"
  | "describe_table"
  | "get_column"
  | "list_indexes"
  | "list_foreign_keys"
  | "show_create_table"
  | "get_table_stats"
  | "search_schema"
  | "route_question"
  | "route_api"
  | "search_api"
  | "call_backend_api"
  | "sample_table_rows"
  | "list_schema"
  | "propose_sql"
  | "execute_sql"
  | "build_chart";

export type AgentPlan =
  | {
      action: "tool";
      tool: AgentToolName;
      args: Record<string, unknown>;
      reasoning: string;
    }
  | {
      action: "answer";
      answer: string;
      reasoning: string;
    };

export type ProposeSqlData = {
  sql: string;
  explanation: string;
};

export type ExecuteSqlData = QueryResult;

export type BuildChartData = {
  chart: ChartSpec | null;
};

export type AgentToolResult = {
  tool: AgentToolName;
  args: Record<string, unknown>;
  /** 人类可读摘要，供 planner 与 trace 使用 */
  output: string;
  data?: ProposeSqlData | ExecuteSqlData | BuildChartData | Record<string, unknown>;
};

export type AgentResumeAction = {
  actionId: "confirm_sql" | "cancel_sql";
  payload?: {
    runId?: string;
    /** 用户在确认前编辑后的 SQL */
    sql?: string;
  };
};

export type AgentTraceEvent =
  | { type: "trace"; phase: string; message: string }
  | { type: "plan"; plan: AgentPlan }
  | {
      type: "plan_stream";
      step: number;
      /** 累积文本 */
      text: string;
      /** 本次增量 */
      delta: string;
    }
  | {
      type: "step_metric";
      step: number;
      planMs: number;
      toolMs?: number;
      totalMs: number;
    }
  | { type: "tool_call"; tool: AgentToolName; args: Record<string, unknown> }
  | {
      type: "tool_result";
      tool: AgentToolName;
      output: string;
      data?: AgentToolResult["data"];
    }
  | { type: "a2ui"; surface: A2UISurface }
  | {
      type: "awaiting_input";
      runId: string;
      reason: "confirm_sql";
      sql: string;
      explanation: string;
    }
  | { type: "answer"; text: string; mock?: boolean; followUps?: string[] }
  | { type: "thread"; threadId: string }
  | { type: "planner_mode"; mock: boolean; label?: string }
  | {
      type: "done";
      steps: number;
      toolCalls: number;
      totalMs: number;
    }
  | { type: "error"; message: string };

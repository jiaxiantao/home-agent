import { formatSqlAnswer } from "@/lib/agent/answer-format";
import { userRequestedChart } from "@/lib/agent/chart-intent";
import type { AgentToolResult, ExecuteSqlData } from "@/lib/agent/types";
import {
  isSuccessfulBackendApiResult,
  type BackendApiCallResult,
} from "@/lib/analytics/backend-api-client";

/**
 * 结果本身已经把话说完时，跳过回答合成那次 LLM 调用。
 *
 * 短路场景：
 *   - 空结果集
 *   - 单行单列标量（COUNT/SUM）
 *   - 有多行 SQL 且接口均为业务失败时，直接输出表格（与 UI 一致，避免模型误读 API 错误）
 * 用户要图表时不短路——图表分支需要模型判断结果能不能出图。
 */

export type DirectAnswer = {
  text: string;
  reason: "empty_result" | "single_scalar" | "tabular_result";
};

function lastSqlResult(prior: AgentToolResult[]): ExecuteSqlData | undefined {
  const entry = [...prior].reverse().find((item) => item.tool === "execute_sql");
  return entry?.data as ExecuteSqlData | undefined;
}

function hasSuccessfulBackendApiRows(prior: AgentToolResult[]) {
  return prior.some((item) => {
    if (item.tool !== "call_backend_api") {
      return false;
    }
    return isSuccessfulBackendApiResult(item.data as BackendApiCallResult | undefined);
  });
}

export function tryDirectAnswer(
  message: string,
  prior: AgentToolResult[],
): DirectAnswer | null {
  if (userRequestedChart(message)) {
    return null;
  }

  const sql = lastSqlResult(prior);

  if (sql) {
    if (sql.rowCount === 0) {
      return {
        text: `未查询到符合条件的数据。\n\n如果预期应该有结果，可以放宽筛选条件（时间范围、状态、门店）后再试一次。`,
        reason: "empty_result",
      };
    }

    if (sql.rowCount === 1 && sql.columns.length === 1) {
      return { text: formatSqlAnswer(sql), reason: "single_scalar" };
    }

    if (!hasSuccessfulBackendApiRows(prior)) {
      return { text: formatSqlAnswer(sql), reason: "tabular_result" };
    }

    return null;
  }

  return null;
}

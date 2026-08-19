import { formatSqlAnswer } from "@/lib/agent/answer-format";
import { userRequestedChart } from "@/lib/agent/chart-intent";
import type { AgentToolResult, ExecuteSqlData } from "@/lib/agent/types";
import type { BackendApiCallResult } from "@/lib/analytics/backend-api-client";

/**
 * 结果本身已经把话说完时，跳过回答合成那次 LLM 调用。
 *
 * 只在「无歧义」的两种情况下短路，其余仍交给模型润色：
 *   - 空结果集：没有任何可总结的内容
 *   - 单行单列：COUNT/SUM 这类标量，模型除了复述一遍数字不会增加信息
 * 用户要图表时不短路——图表分支需要模型判断结果能不能出图。
 */

export type DirectAnswer = {
  text: string;
  reason: "empty_result" | "single_scalar";
};

function lastSqlResult(prior: AgentToolResult[]): ExecuteSqlData | undefined {
  const entry = [...prior].reverse().find((item) => item.tool === "execute_sql");
  return entry?.data as ExecuteSqlData | undefined;
}

function hasBackendApiRows(prior: AgentToolResult[]) {
  return prior.some((item) => {
    if (item.tool !== "call_backend_api") {
      return false;
    }
    const data = item.data as BackendApiCallResult | undefined;
    return data?.status === "success" && (data.table?.rows.length ?? 0) > 0;
  });
}

export function tryDirectAnswer(
  message: string,
  prior: AgentToolResult[],
): DirectAnswer | null {
  if (userRequestedChart(message)) {
    return null;
  }

  // 接口结果字段多、语义杂，交给模型总结更稳
  if (hasBackendApiRows(prior)) {
    return null;
  }

  const sql = lastSqlResult(prior);
  if (!sql) {
    return null;
  }

  if (sql.rowCount === 0) {
    return {
      text: `未查询到符合条件的数据。\n\n如果预期应该有结果，可以放宽筛选条件（时间范围、状态、门店）后再试一次。`,
      reason: "empty_result",
    };
  }

  if (sql.rowCount === 1 && sql.columns.length === 1) {
    return { text: formatSqlAnswer(sql), reason: "single_scalar" };
  }

  return null;
}

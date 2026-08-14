import type { AgentToolResult } from "@/lib/agent/types";

const MAX_OUTPUT_CHARS = 1200;
const MAX_JSON_CHARS = 2400;
const MAX_ROW_PREVIEW = 8;
const MAX_COLUMN_PREVIEW = 24;

function truncateText(value: string, max: number) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}…(truncated ${value.length - max} chars)`;
}

function truncateJson(value: unknown, max: number) {
  try {
    const raw = JSON.stringify(value);
    if (!raw) {
      return undefined;
    }

    if (raw.length <= max) {
      return value;
    }

    return {
      _truncated: true,
      preview: `${raw.slice(0, max)}…`,
      originalChars: raw.length,
    };
  } catch {
    return { _truncated: true, preview: "[unserializable]" };
  }
}

function slimExecuteData(data: Record<string, unknown>) {
  const columns = Array.isArray(data.columns)
    ? data.columns.slice(0, MAX_COLUMN_PREVIEW).map(String)
    : [];
  const rows = Array.isArray(data.rows)
    ? data.rows.slice(0, MAX_ROW_PREVIEW)
    : [];

  return {
    sql: typeof data.sql === "string" ? truncateText(data.sql, 800) : data.sql,
    columns,
    rowCount: data.rowCount,
    truncated: data.truncated,
    rowsPreview: rows,
    rowsOmitted:
      Array.isArray(data.rows) && data.rows.length > MAX_ROW_PREVIEW
        ? data.rows.length - MAX_ROW_PREVIEW
        : 0,
  };
}

/** 压缩 prior 工具结果，避免撑爆 planner 上下文 */
export function truncatePriorForPlanner(
  prior: AgentToolResult[],
): Array<{
  tool: AgentToolResult["tool"];
  args: Record<string, unknown>;
  output: string;
  data?: unknown;
}> {
  return prior.map((item) => {
    const args = truncateJson(item.args, 800) as Record<string, unknown>;
    const output = truncateText(item.output, MAX_OUTPUT_CHARS);

    if (!item.data || typeof item.data !== "object") {
      return { tool: item.tool, args, output };
    }

    const dataRecord = item.data as Record<string, unknown>;

    if (
      item.tool === "execute_sql" &&
      Array.isArray(dataRecord.columns) &&
      Array.isArray(dataRecord.rows)
    ) {
      return {
        tool: item.tool,
        args,
        output,
        data: slimExecuteData(dataRecord),
      };
    }

    return {
      tool: item.tool,
      args,
      output,
      data: truncateJson(item.data, MAX_JSON_CHARS),
    };
  });
}

export function formatPriorContinuationPrompt(
  userMessage: string,
  prior: AgentToolResult[],
) {
  return [
    `用户问题：${userMessage}`,
    "已执行过以下工具，请基于结果继续完成用户问题。",
    "若用户要求图表，且当前结果无法出图（单行汇总、缺少分类列），必须立刻 propose_sql 写出可出图的分组/区间统计（CASE WHEN 分桶 + GROUP BY），不要再探 MIN/MAX，也不要直接回答。",
    "",
    "工具结果：",
    JSON.stringify(truncatePriorForPlanner(prior), null, 2),
  ].join("\n");
}

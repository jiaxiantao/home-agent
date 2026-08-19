import {
  isSuccessfulBackendApiResult,
  type BackendApiCallResult,
} from "@/lib/analytics/backend-api-client";
import {
  formatDisplayValue,
  formatRecordAsBulletList,
} from "@/lib/analytics/display-value";
import type { ExecuteSqlData } from "@/lib/agent/types";

export function formatRowsAsMarkdownTable(
  columns: string[],
  rows: Record<string, unknown>[],
  maxRows = 8,
) {
  if (!columns.length || !rows.length) {
    return "（无数据）";
  }

  const slice = rows.slice(0, maxRows);
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = slice
    .map((row) => `| ${columns.map((column) => formatCell(row[column])).join(" | ")} |`)
    .join("\n");

  const suffix =
    rows.length > maxRows ? `\n\n（仅展示前 ${maxRows} 条，共 ${rows.length} 条）` : "";

  return `${header}\n${divider}\n${body}${suffix}`;
}

function formatCell(value: unknown) {
  return formatDisplayValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function summarizeBackendApiResult(result: BackendApiCallResult) {
  if (!isSuccessfulBackendApiResult(result)) {
    return result.message || "接口未返回可用数据。";
  }

  const { columns, rows } = result.table;
  return `接口 \`${result.endpointId}\` 返回 ${rows.length} 条记录。`;
}

export function formatBackendApiAnswer(result: BackendApiCallResult) {
  if (!isSuccessfulBackendApiResult(result)) {
    return result.message || "接口调用未返回可用数据，请稍后重试或改用 SQL 查询。";
  }

  const { columns, rows } = result.table;
  const summary = summarizeBackendApiResult(result);
  return `${summary}\n\n${formatRowsAsMarkdownTable(columns, rows)}`;
}

export function formatBackendApiAnswers(results: BackendApiCallResult[]) {
  const ok = results.filter((item) => isSuccessfulBackendApiResult(item));
  if (ok.length === 0) {
    return "接口调用未返回可用数据，请稍后重试或改用 SQL 查询。";
  }
  if (ok.length === 1) {
    return formatBackendApiAnswer(ok[0]!);
  }
  return ok
    .map((item, index) => `### 数据源 ${index + 1}\n\n${formatBackendApiAnswer(item)}`)
    .join("\n\n");
}

export function summarizeSqlResult(result: ExecuteSqlData) {
  if (result.rowCount === 0) {
    return "查询成功，但没有返回数据行。";
  }
  if (result.rowCount === 1 && result.columns.length === 1) {
    const key = result.columns[0]!;
    return `查询成功：${key} = ${String(result.rows[0]?.[key])}`;
  }
  return `查询成功，返回 ${result.rowCount} 行${result.truncated ? "（已截断到上限）" : ""}。`;
}

export function formatSqlAnswer(result: ExecuteSqlData) {
  const summary = summarizeSqlResult(result);
  if (!result.rows.length) {
    return summary;
  }
  if (result.rowCount === 1 && result.columns.length > 1) {
    const detail = formatRecordAsBulletList(result.columns, result.rows[0]!);
    return detail ? `${summary}\n\n${detail}` : summary;
  }
  return `${summary}\n\n${formatRowsAsMarkdownTable(result.columns, result.rows)}`;
}

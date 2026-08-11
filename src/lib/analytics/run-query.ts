import type { RowDataPacket } from "mysql2/promise";

import { assertQueryCostAcceptable } from "@/lib/analytics/query-cost-guard";
import { getAnalyticsMysqlConfig, queryAnalyticsMysql } from "@/lib/analytics/mysql";
import { assertReadOnlySql, ensureLimit } from "@/lib/analytics/sql-guard";
import { assertAllowedTables } from "@/lib/security/table-allowlist";
import { maskQueryRows } from "@/lib/security/pii-mask";

export type QueryResult = {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
};

function serializeCell(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return value;
}

export async function runAnalyticsQuery(rawSql: string): Promise<QueryResult> {
  const config = getAnalyticsMysqlConfig();
  const maxRows = config?.maxRows ?? 500;
  const guarded = assertReadOnlySql(rawSql);

  if (!guarded.ok) {
    throw new Error(guarded.reason);
  }

  const allowlist = assertAllowedTables(guarded.sql);

  if (!allowlist.ok) {
    throw new Error(allowlist.reason);
  }

  await assertQueryCostAcceptable(guarded.sql);

  const sql = ensureLimit(guarded.sql, maxRows);
  const { rows, fields } = await queryAnalyticsMysql<RowDataPacket[]>(sql);

  const serialized = rows.map((row) => {
    const next: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      next[key] = serializeCell(value);
    }

    return next;
  });

  const columns =
    fields.length > 0
      ? fields
      : serialized[0]
        ? Object.keys(serialized[0])
        : [];

  const masked = maskQueryRows(columns, serialized);
  const truncated = masked.length >= maxRows;

  return {
    sql,
    columns,
    rows: truncated ? masked.slice(0, maxRows) : masked,
    rowCount: Math.min(masked.length, maxRows),
    truncated,
  };
}

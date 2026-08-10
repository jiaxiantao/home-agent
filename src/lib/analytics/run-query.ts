import type { RowDataPacket } from "mysql2/promise";

import { getAnalyticsMysqlConfig, queryAnalyticsMysql } from "@/lib/analytics/mysql";
import { assertReadOnlySql, ensureLimit } from "@/lib/analytics/sql-guard";

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

  const truncated = serialized.length >= maxRows;

  return {
    sql,
    columns,
    rows: truncated ? serialized.slice(0, maxRows) : serialized,
    rowCount: Math.min(serialized.length, maxRows),
    truncated,
  };
}

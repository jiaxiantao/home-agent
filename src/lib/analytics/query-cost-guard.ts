import type { RowDataPacket } from "mysql2/promise";

import { queryAnalyticsMysql } from "@/lib/analytics/mysql";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";

function getExplainMaxRows() {
  const parsed = Number(process.env.ANALYTICS_MYSQL_EXPLAIN_MAX_ROWS ?? "200000");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 200_000;
}

export function isQueryCostGuardEnabled() {
  const flag = process.env.ANALYTICS_MYSQL_EXPLAIN_GUARD?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || isProductionStrictFallback();
}

function isProductionStrictFallback() {
  return process.env.NODE_ENV === "production";
}

export async function assertQueryCostAcceptable(rawSql: string) {
  if (!isQueryCostGuardEnabled()) {
    return;
  }

  const guarded = assertReadOnlySql(rawSql);

  if (!guarded.ok) {
    throw new Error(guarded.reason);
  }

  const upper = guarded.sql.trim().toUpperCase();
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    return;
  }

  const explainSql = `EXPLAIN ${guarded.sql}`;
  const { rows } = await queryAnalyticsMysql<RowDataPacket[]>(explainSql);

  let estimatedRows = 0;

  for (const row of rows) {
    const value = row.rows ?? row.ROWS;
    estimatedRows += Number(value ?? 0);
  }

  const maxRows = getExplainMaxRows();

  if (estimatedRows > maxRows) {
    throw new Error(
      `EXPLAIN 估计扫描行数 ${estimatedRows} 超过上限 ${maxRows}，请缩小范围或增加过滤条件`,
    );
  }
}

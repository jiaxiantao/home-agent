import { AsyncLocalStorage } from "node:async_hooks";

import { assertSqlIdentifier } from "@/lib/analytics/sql-identifier";
import { assertDatabaseNameAllowed } from "@/lib/security/database-allowlist";

const preferredDbStore = new AsyncLocalStorage<string>();

export function runWithPreferredAnalyticsDatabase<T>(
  database: string | undefined,
  fn: () => T,
): T {
  const trimmed = database?.trim();

  if (!trimmed) {
    return fn();
  }

  const normalized = assertSqlIdentifier(trimmed, "数据库");
  assertDatabaseNameAllowed(normalized);
  return preferredDbStore.run(normalized, fn);
}

export function getPreferredAnalyticsDatabase() {
  return preferredDbStore.getStore();
}

const MISSING_DATABASE_MESSAGE =
  "未指定数据库：请先 route_question / search_schema 确定目标库，或传入 database 参数";

/** 解析本次工具调用的目标库：显式参数 > 会话偏好库；不回落连接配置里的默认库 */
export function resolvePreferredOrDefaultDatabase(explicit?: string) {
  const resolved = explicit?.trim() || getPreferredAnalyticsDatabase();

  if (!resolved) {
    throw new Error(MISSING_DATABASE_MESSAGE);
  }

  const normalized = assertSqlIdentifier(resolved, "数据库");
  assertDatabaseNameAllowed(normalized);
  return normalized;
}

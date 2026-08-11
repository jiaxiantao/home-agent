import { AsyncLocalStorage } from "node:async_hooks";

import { assertSqlIdentifier } from "@/lib/analytics/sql-identifier";
import { assertDatabaseNameAllowed } from "@/lib/security/database-allowlist";
import { getAnalyticsMysqlConfig } from "@/lib/analytics/mysql";

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

/** 工具未显式传 database 时：优先会话偏好库，否则连接默认库 */
export function resolvePreferredOrDefaultDatabase(explicit?: string) {
  const config = getAnalyticsMysqlConfig();

  if (!config) {
    throw new Error("分析库未配置");
  }

  const resolved = assertSqlIdentifier(
    explicit?.trim() ||
      getPreferredAnalyticsDatabase() ||
      config.database,
    "数据库",
  );
  assertDatabaseNameAllowed(resolved);
  return resolved;
}

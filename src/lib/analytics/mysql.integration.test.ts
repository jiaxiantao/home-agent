import { afterAll, describe, expect, it } from "vitest";

import {
  checkAnalyticsMysqlHealth,
  getAnalyticsMysqlConfig,
  queryAnalyticsMysql,
} from "@/lib/analytics/mysql";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";

const configured = Boolean(
  process.env.ANALYTICS_MYSQL_HOST?.trim() &&
    process.env.ANALYTICS_MYSQL_DATABASE?.trim() &&
    process.env.ANALYTICS_MYSQL_USER?.trim(),
);

describe.skipIf(!configured)("analytics mysql integration", () => {
  it("connects and answers SELECT 1", async () => {
    const config = getAnalyticsMysqlConfig();
    expect(config).not.toBeNull();

    const health = await checkAnalyticsMysqlHealth();
    expect(health.configured).toBe(true);
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("runs a guarded read-only probe query", async () => {
    const sql = "SELECT DATABASE() AS db_name LIMIT 1";
    expect(assertReadOnlySql(sql).ok).toBe(true);

    const { rows, fields } = await queryAnalyticsMysql(sql);
    expect(fields).toContain("db_name");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  afterAll(async () => {
    // pools are process-scoped; vitest will exit after suite
  });
});

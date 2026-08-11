import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAnalyticsMysqlConfig,
  listAnalyticsEnvProfiles,
  listDeclaredAnalyticsEnvs,
  resolveAnalyticsEnvId,
  runWithAnalyticsEnv,
} from "@/lib/analytics/mysql";

describe("analytics env profiles", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists declared profiles", () => {
    vi.stubEnv("ANALYTICS_MYSQL_PROFILES", "test,prepub");
    expect(listDeclaredAnalyticsEnvs()).toEqual(["test", "prepub"]);
  });

  it("resolves default and rejects unknown", () => {
    vi.stubEnv("ANALYTICS_MYSQL_PROFILES", "test,prepub");
    vi.stubEnv("ANALYTICS_MYSQL_ENV", "test");
    vi.stubEnv("ANALYTICS_MYSQL_HOST", "h.test");
    vi.stubEnv("ANALYTICS_MYSQL_DATABASE", "matador");
    vi.stubEnv("ANALYTICS_MYSQL_USER", "ro");

    expect(resolveAnalyticsEnvId(undefined)).toBe("test");
    expect(() => resolveAnalyticsEnvId("prod")).toThrow(/未知分析环境/);
  });

  it("loads profile-specific config inside ALS", () => {
    vi.stubEnv("ANALYTICS_MYSQL_PROFILES", "test,prepub");
    vi.stubEnv("ANALYTICS_MYSQL_ENV", "test");
    vi.stubEnv("ANALYTICS_MYSQL_HOST", "test-host");
    vi.stubEnv("ANALYTICS_MYSQL_DATABASE", "matador");
    vi.stubEnv("ANALYTICS_MYSQL_USER", "ro");
    vi.stubEnv("ANALYTICS_MYSQL_PREPUB_HOST", "pre-host");
    vi.stubEnv("ANALYTICS_MYSQL_PREPUB_DATABASE", "matador");
    vi.stubEnv("ANALYTICS_MYSQL_PREPUB_USER", "ro");

    const profiles = listAnalyticsEnvProfiles();
    expect(profiles.every((item) => item.configured)).toBe(true);

    const pre = runWithAnalyticsEnv("prepub", () => getAnalyticsMysqlConfig());
    expect(pre?.host).toBe("pre-host");
    expect(pre?.env).toBe("prepub");
  });
});

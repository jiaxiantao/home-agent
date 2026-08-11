import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ANALYTICS_ENVS,
  getAnalyticsEnvLabel,
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

  it("defaults to test, prepub, prod when profiles unset", () => {
    vi.unstubAllEnvs();
    expect(listDeclaredAnalyticsEnvs()).toEqual([...DEFAULT_ANALYTICS_ENVS]);
  });

  it("lists declared profiles override", () => {
    vi.stubEnv("ANALYTICS_MYSQL_PROFILES", "test,prepub");
    expect(listDeclaredAnalyticsEnvs()).toEqual(["test", "prepub"]);
  });

  it("labels env ids in Chinese", () => {
    expect(getAnalyticsEnvLabel("test")).toBe("测试");
    expect(getAnalyticsEnvLabel("prepub")).toBe("预发");
    expect(getAnalyticsEnvLabel("prod")).toBe("线上");
  });

  it("resolves default and rejects unknown", () => {
    vi.stubEnv("ANALYTICS_MYSQL_PROFILES", "test,prepub,prod");
    vi.stubEnv("ANALYTICS_MYSQL_ENV", "test");
    vi.stubEnv("ANALYTICS_MYSQL_HOST", "h.test");
    vi.stubEnv("ANALYTICS_MYSQL_DATABASE", "matador");
    vi.stubEnv("ANALYTICS_MYSQL_USER", "ro");

    expect(resolveAnalyticsEnvId(undefined)).toBe("test");
    expect(() => resolveAnalyticsEnvId("staging")).toThrow(/未知分析环境/);
  });

  it("loads profile-specific config inside ALS", () => {
    vi.stubEnv("ANALYTICS_MYSQL_PROFILES", "test,prepub,prod");
    vi.stubEnv("ANALYTICS_MYSQL_ENV", "test");
    vi.stubEnv("ANALYTICS_MYSQL_HOST", "test-host");
    vi.stubEnv("ANALYTICS_MYSQL_DATABASE", "matador");
    vi.stubEnv("ANALYTICS_MYSQL_USER", "ro");
    vi.stubEnv("ANALYTICS_MYSQL_PREPUB_HOST", "pre-host");
    vi.stubEnv("ANALYTICS_MYSQL_PREPUB_DATABASE", "matador");
    vi.stubEnv("ANALYTICS_MYSQL_PREPUB_USER", "ro");

    const profiles = listAnalyticsEnvProfiles();
    expect(profiles.find((item) => item.id === "test")?.configured).toBe(true);
    expect(profiles.find((item) => item.id === "prepub")?.configured).toBe(true);
    expect(profiles.find((item) => item.id === "prod")?.configured).toBe(false);

    const pre = runWithAnalyticsEnv("prepub", () => getAnalyticsMysqlConfig());
    expect(pre?.host).toBe("pre-host");
    expect(pre?.env).toBe("prepub");
  });
});

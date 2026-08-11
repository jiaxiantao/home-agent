import { afterEach, describe, expect, it, vi } from "vitest";

import { collectProductionIssues, isProductionStrict } from "@/lib/security/production-config";

describe("production-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns no issues in non-production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PRODUCTION_STRICT", "");
    expect(collectProductionIssues()).toEqual([]);
  });

  it("flags missing auth in production strict", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PRODUCTION_STRICT", "1");
    vi.stubEnv("AUTH_MODE", "disabled");
    vi.stubEnv("ANALYTICS_MYSQL_TABLE_ALLOWLIST", "");

    const issues = collectProductionIssues();
    expect(issues.some((item) => item.includes("AUTH_MODE"))).toBe(true);
    expect(issues.some((item) => item.includes("ALLOWLIST"))).toBe(true);
    expect(isProductionStrict()).toBe(true);
  });
});

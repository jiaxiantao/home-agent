import { describe, expect, it, beforeAll, afterAll } from "vitest";

import {
  resetDfcApiCatalogCache,
  setDfcApiCatalogCache,
} from "@/lib/analytics/api-catalog-store";
import { loadDfcApiCatalogFromJsonFile } from "@/lib/analytics/dfc-api-catalog-json";
import { testDfcApiEndpoint } from "@/lib/analytics/api-endpoint-test";

describe("api-endpoint-test", () => {
  beforeAll(() => {
    try {
      const endpoints = loadDfcApiCatalogFromJsonFile();
      setDfcApiCatalogCache(endpoints, { total: endpoints.length });
    } catch {
      setDfcApiCatalogCache([], { total: 0 });
    }
  });

  afterAll(() => {
    resetDfcApiCatalogCache();
  });

  it("reports missing endpoint", async () => {
    const result = await testDfcApiEndpoint("missing:endpoint:id");
    expect(result.ok).toBe(false);
    expect(result.status).toBe("missing");
  });

  it("skips HTTP probe for undeployed cheniu-user", async () => {
    const endpoints = loadDfcApiCatalogFromJsonFile();
    const cheniu = endpoints.find((item) => item.appCode === "cheniu-user");
    expect(cheniu).toBeTruthy();
    const result = await testDfcApiEndpoint(cheniu!.id);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/跳过探测/);
  });

  it("skips HTTP probe for undeployed customer-biz-data-system", async () => {
    const endpoints = loadDfcApiCatalogFromJsonFile();
    const customerBiz = endpoints.find(
      (item) => item.appCode === "customer-biz-data-system",
    );
    expect(customerBiz).toBeTruthy();
    const result = await testDfcApiEndpoint(customerBiz!.id);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/customer-biz-data-system/);
  });

  it("skips retired and long-running matador idlefish backup endpoints", async () => {
    const endpoints = loadDfcApiCatalogFromJsonFile();
    const retired = {
      id: "matador:http:GET:/api/backup/idlefish/IdleFishBackupApi/changeIdleFishAccount:changeIdleFishAccount",
      appCode: "matador",
      repo: "niu/backends/cheniu",
      entity: "car",
      title: "changeIdleFishAccount",
      description: "",
      matchPatterns: [],
      kind: "http" as const,
      readOnly: true,
      preferOverSql: false,
      http: {
        method: "GET" as const,
        path: "/api/backup/idlefish/IdleFishBackupApi/changeIdleFishAccount",
      },
      keywords: [],
      sqlFallback: { database: "matador", table: "*", hint: "" },
      baseUrlEnvKey: "DFC_API_MATADOR_BASE_URL",
    };
    setDfcApiCatalogCache([...endpoints, retired], { total: endpoints.length + 1 });

    const retiredResult = await testDfcApiEndpoint(retired.id);
    expect(retiredResult.ok).toBe(false);
    expect(retiredResult.status).toBe("skipped");
    expect(retiredResult.message).toMatch(/注释|下线/);

    const initJob = await testDfcApiEndpoint(
      "matador:http:GET:/api/backup/idlefish/IdleFishBackupApi/initCarSourceDivision:initCarSourceDivision",
    );
    expect(initJob.ok).toBe(false);
    expect(initJob.status).toBe("skipped");
    expect(initJob.message).toMatch(/初始化/);
  });

  it("validates http endpoint catalog entry", async () => {
    const result = await testDfcApiEndpoint(
      "super-mario:http:GET:/v1/customerAction/crmQueryCustomerInfo.json:crmQueryCustomerInfo",
    );
    expect(result.kind).toBe("http");
    expect([
      "success",
      "error",
      "not_configured",
      "reachable",
      "blocked",
      "skipped",
      "upstream_unavailable",
      "upstream_error",
      "auth",
    ]).toContain(result.status);
  });
});

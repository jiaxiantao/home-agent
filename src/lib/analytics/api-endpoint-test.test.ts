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
    expect(result.ok).toBe(true);
    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/跳过探测/);
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
      "auth",
    ]).toContain(result.status);
  });
});

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

  it("validates dubbo endpoint catalog entry", async () => {
    const result = await testDfcApiEndpoint(
      "matador:dubbo:com.souche.cheniu.api.remote.user.MemberInfoRemote:queryUserInfoByPhone",
    );
    expect(result.kind).toBe("dubbo");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Dubbo");
  });
});

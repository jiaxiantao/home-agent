import { describe, expect, it, beforeAll, afterAll } from "vitest";

import {
  dfcMcpCallHttpApi,
  dfcMcpCatalogStats,
  dfcMcpGetApi,
  dfcMcpRouteApi,
  dfcMcpSearchApis,
} from "@/lib/mcp/dfc-api/facade";
import {
  resetDfcApiCatalogForTests,
  warmDfcApiCatalogFromJsonForTests,
} from "@/lib/analytics/dfc-api-catalog-test-setup";

describe("dfc mcp facade", () => {
  beforeAll(() => {
    warmDfcApiCatalogFromJsonForTests();
  });

  afterAll(() => {
    resetDfcApiCatalogForTests();
  });
  it("returns catalog stats", () => {
    const result = dfcMcpCatalogStats();
    expect(result.catalogSize).toBeGreaterThan(1000);
    expect(result.stats).toBeTruthy();
  });

  it("searches http apis by keyword", () => {
    const result = dfcMcpSearchApis({
      keyword: "queryCustomerDetailsByContact",
      kind: "http",
      readOnlyOnly: false,
      limit: 10,
    });
    expect(result.catalogSize).toBeGreaterThan(0);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((item) => item.endpoint.kind === "http")).toBe(
      true,
    );
  });

  it("routes customer phone questions", () => {
    const result = dfcMcpRouteApi({
      question: "我想知道客户手机号为 13166990795 的客户信息",
    });
    expect(result.params.phone).toBe("13166990795");
    expect(result.bestMatch?.endpoint.methodName).toBe(
      "queryCustomerDetailsByContact",
    );
    expect(Array.isArray(result.candidates)).toBe(true);
  });

  it("gets api by id", () => {
    const id =
      "super-mario:http:GET:/v1/customerAction/crmQueryCustomerInfo.json:crmQueryCustomerInfo";
    const result = dfcMcpGetApi(id);
    expect(result.endpoint?.id).toBe(id);
    expect(result.endpoint?.kind).toBe("http");
    expect(result.endpoint?.http?.path).toContain("crmQueryCustomerInfo");
    expect(Array.isArray(result.endpoint?.matchPatterns)).toBe(true);
  });

  it("routes plate questions to queryRecordPageInfo", () => {
    const result = dfcMcpRouteApi({
      question: "查询车牌号为皖JV066M的车辆信息",
    });
    expect(result.params.plate).toBe("皖JV066M");
    expect(result.bestMatch?.endpoint.methodName).toBe("queryRecordPageInfo");
    expect(result.bestMatch?.httpCallable).toBe(true);
  });

  it("skips dubbo calls in phase-1", async () => {
    const id =
      "ai-privacy-number:dubbo:com.souche.aiprivacynumber.api.AiPrivacyNumberService:bindAxB";
    const result = await dfcMcpCallHttpApi({ endpointId: id });
    expect(result.status).toBe("skipped");
    expect(result.failureKind).toBe("skipped");
    expect(result.message).toMatch(/Dubbo/);
  });
});

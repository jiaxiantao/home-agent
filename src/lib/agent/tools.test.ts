import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { runAgentTool } from "@/lib/agent/tools";
import {
  resetDfcApiCatalogForTests,
  warmDfcApiCatalogFromJsonForTests,
} from "@/lib/analytics/dfc-api-catalog-test-setup";

describe("runAgentTool", () => {
  beforeAll(() => {
    warmDfcApiCatalogFromJsonForTests();
  });

  afterAll(() => {
    resetDfcApiCatalogForTests();
  });
  it("proposes read-only sql", async () => {
    const result = await runAgentTool("propose_sql", {
      sql: "SELECT COUNT(*) AS c FROM car",
      explanation: "count cars",
    });
    expect(result.data).toMatchObject({
      sql: "SELECT COUNT(*) AS c FROM car",
      explanation: "count cars",
    });
  });

  it("rejects dangerous propose_sql", async () => {
    await expect(
      runAgentTool("propose_sql", { sql: "DELETE FROM car", explanation: "bad" }),
    ).rejects.toThrow(/只读校验/);
  });

  it("lists schema catalog", async () => {
    const result = await runAgentTool("list_schema", {});
    expect(result.output).toContain("car");
  });

  it("lists project database registry without requiring live mysql", async () => {
    const result = await runAgentTool("list_project_databases", {});
    expect(result.output).toContain("matador");
  });

  it("routes api for customer phone question", async () => {
    const result = await runAgentTool("route_api", {
      question: "查询客户手机号为16612341112的客户信息",
    });
    expect(result.output).toContain("super-mario");
    expect(result.output).toContain("queryCustomerDetailsByContact");
    expect(result.data).toMatchObject({
      params: { phone: "16612341112" },
    });
  });

  it("accepts search_schema query alias and requires a keyword", async () => {
    await expect(runAgentTool("search_schema", {})).rejects.toThrow(/keyword/);
    try {
      await runAgentTool("search_schema", { query: "车牌号" });
    } catch (error) {
      expect(String(error)).not.toMatch(/需要 keyword/);
      expect(String(error)).not.toMatch(/route_question 需要 question/);
    }
  });

  it("accepts route_question query alias", async () => {
    try {
      await runAgentTool("route_question", { query: "查询车牌号为皖JV066M的车辆信息" });
    } catch (error) {
      expect(String(error)).not.toMatch(/需要 question/);
    }
  });

  it("search_api finds CRM endpoints by keyword", async () => {
    const result = await runAgentTool("search_api", {
      keyword: "客户手机号 queryCustomerDetailsByContact",
      appCode: "super-mario",
      limit: 5,
    });
    expect(result.output).toContain("queryCustomerDetailsByContact");
    expect((result.data as { matches: unknown[] }).matches.length).toBeGreaterThan(0);
  });


});

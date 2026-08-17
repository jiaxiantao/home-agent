import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { getDefaultTestArgs, testAgentTool } from "@/lib/agent/tool-test";
import {
  resetDfcApiCatalogForTests,
  warmDfcApiCatalogFromJsonForTests,
} from "@/lib/analytics/dfc-api-catalog-test-setup";

describe("tool-test", () => {
  beforeAll(() => {
    warmDfcApiCatalogFromJsonForTests();
  });

  afterAll(() => {
    resetDfcApiCatalogForTests();
  });
  it("provides default args for schema tools", () => {
    expect(getDefaultTestArgs("list_schema")).toEqual({});
    expect(getDefaultTestArgs("search_schema")).toMatchObject({ keyword: "car" });
  });

  it("tests list_schema without throwing", async () => {
    const result = await testAgentTool("list_schema");
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("blocks execute_sql by default", async () => {
    const result = await testAgentTool("execute_sql");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/execute_sql/);
  });

  it("tests route_api with default question", async () => {
    const result = await testAgentTool("route_api");
    expect(result.ok).toBe(true);
    expect(result.output).toContain("super-mario");
  });
});

import { describe, expect, it } from "vitest";

import { runAgentTool } from "@/lib/agent/tools";

describe("runAgentTool", () => {
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

  it("search_api finds CRM endpoints by keyword", async () => {
    const result = await runAgentTool("search_api", {
      keyword: "客户手机号 queryCustomerDetailsByContact",
      appCode: "super-mario",
      limit: 5,
    });
    expect(result.output).toContain("queryCustomerDetailsByContact");
    expect((result.data as { matches: unknown[] }).matches.length).toBeGreaterThan(0);
  });

  it("skips dubbo-only backend call with sql fallback hint", async () => {
    const result = await runAgentTool("call_backend_api", {
      endpointId:
        "matador:dubbo:com.souche.cheniu.api.remote.user.MemberInfoRemote:queryUserInfoByPhone",
      phone: "16612341112",
    });
    expect(result.output).toContain("Dubbo");
    expect(result.data).toMatchObject({
      status: "skipped",
      sqlFallback: { database: "matador", table: "cheniu_user" },
    });
  });
});

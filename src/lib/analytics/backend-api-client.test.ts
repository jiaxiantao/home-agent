import { describe, expect, it } from "vitest";

import { buildSuggestedSqlForEndpoint } from "@/lib/analytics/backend-api-client";
import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";

describe("buildSuggestedSqlForEndpoint", () => {
  const endpoint = {
    id: "super-mario:http:GET:/customer/customerDetail/queryRecordDetail:queryRecordDetail",
    appCode: "super-mario",
    repo: "gourd/super-mario",
    entity: "crm_customer",
    title: "CRM 客户详情",
    description: "",
    matchPatterns: [],
    kind: "http",
    readOnly: true,
    preferOverSql: true,
    keywords: [],
    sqlFallback: { database: "super_mario", table: "customer", hint: "WHERE id = ?" },
    baseUrlEnvKey: "DFC_API_SUPER_MARIO_BASE_URL",
  } satisfies DfcApiEndpoint;

  it("builds customer-by-id sql without shop_code filter", () => {
    const sql = buildSuggestedSqlForEndpoint(endpoint, {
      recordId: "ANwbnMyLF0",
      objCode: "customer",
    });
    expect(sql).toContain("`super_mario`.`customer`");
    expect(sql).toContain("ANwbnMyLF0");
    expect(sql).not.toMatch(/shop_code\s*=/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertTestSafeUpstreamUrl,
  buildDfcUpstreamSsoHeaders,
  buildSuggestedSqlForEndpoint,
} from "@/lib/analytics/backend-api-client";
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

  it("builds customer-by-phone sql matching phone/backup/wechat", () => {
    const sql = buildSuggestedSqlForEndpoint(endpoint, {
      phone: "13166990795",
    });
    expect(sql).toContain("13166990795");
    expect(sql).toMatch(/phone\s*=/);
    expect(sql).toMatch(/weichat\s*=/);
  });
});

describe("buildDfcUpstreamSsoHeaders", () => {
  it("writes Souche-Security-Token only once (undici merges case variants)", () => {
    const headers = buildDfcUpstreamSsoHeaders({
      token: "22_demo_token",
      tokenHeader: "Souche-Security-Token",
    });
    const soucheKeys = Object.keys(headers).filter((key) =>
      key.toLowerCase() === "souche-security-token",
    );
    expect(soucheKeys).toHaveLength(1);
    expect(headers[soucheKeys[0]!]).toBe("22_demo_token");
    expect(headers.Cookie).toBe("_security_token=22_demo_token");
  });
});

describe("assertTestSafeUpstreamUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks souche.com hosts in test env", () => {
    vi.stubEnv("ANALYTICS_MYSQL_ENV", "test");
    expect(assertTestSafeUpstreamUrl("https://matador.souche.com/car/detail")).toMatch(
      /禁止调用线上域名 matador\.souche\.com/,
    );
    expect(assertTestSafeUpstreamUrl("http://super-mario.stable.dasouche.net/crm")).toBeUndefined();
  });

  it("allows souche.com outside test env", () => {
    vi.stubEnv("ANALYTICS_MYSQL_ENV", "prod");
    expect(assertTestSafeUpstreamUrl("https://matador.souche.com/car/detail")).toBeUndefined();
  });
});

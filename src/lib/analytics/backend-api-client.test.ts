import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertTestSafeUpstreamUrl,
  buildDfcUpstreamSsoHeaders,
  buildSuggestedSqlForEndpoint,
  callBackendApi,
  isBotWallWafBlock,
  isBusinessFailure,
  isSuccessfulBackendApiResult,
  isDfcApiEndpointEnvConfigured,
  parseSpringMissingParameterMessage,
  previewBackendApiCall,
  resolveDfcApiEndpointBaseUrl,
} from "@/lib/analytics/backend-api-client";
import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";

describe("parseSpringMissingParameterMessage", () => {
  it("detects Spring required-parameter 400 bodies", () => {
    expect(
      parseSpringMissingParameterMessage({
        status: 400,
        error: "Bad Request",
        message: "Required String parameter 'articleId' is not present",
      }),
    ).toBe("articleId");
    expect(
      parseSpringMissingParameterMessage({
        message: "Required Integer parameter 'pageNum' is not present",
      }),
    ).toBe("pageNum");
    expect(parseSpringMissingParameterMessage({ message: "Not found" })).toBeNull();
  });
});

describe("isBusinessFailure", () => {
  it("detects Mars-style business error payloads", () => {
    expect(
      isBusinessFailure({ success: false, code: "500", msg: "参数异常" }),
    ).toBe(true);
    expect(
      isBusinessFailure({
        success: false,
        code: "PATH_NOT_EXISTS",
        msg: "json方法未找到",
      }),
    ).toBe(true);
    expect(isBusinessFailure({ success: true, code: "200", data: {} })).toBe(false);
    expect(isBusinessFailure({ code: "200", data: {} })).toBe(false);
  });
});

describe("isSuccessfulBackendApiResult", () => {
  it("rejects legacy success status with business error payload", () => {
    expect(
      isSuccessfulBackendApiResult({
        status: "success",
        endpointId: "x",
        appCode: "super-mario",
        message: "ok",
        response: { success: false, code: "500", msg: "参数异常" },
        table: {
          columns: ["code", "msg", "success"],
          rows: [{ code: "500", msg: "参数异常", success: false }],
        },
      }),
    ).toBe(false);
  });

  it("accepts real tabular API data", () => {
    expect(
      isSuccessfulBackendApiResult({
        status: "success",
        endpointId: "x",
        appCode: "super-mario",
        message: "ok",
        response: { success: true, data: [{ id: "1" }] },
        table: { columns: ["id"], rows: [{ id: "1" }] },
      }),
    ).toBe(true);
  });
});

describe("applyKnownQueryParamFallbacks via previewBackendApiCall", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps phone to contact for queryCustomerDetailsByContact without catalog queryParams", () => {
    vi.stubEnv(
      "DFC_API_SUPER_MARIO_BASE_URL",
      "http://super-mario.stable.dasouche.net",
    );
    const endpoint = {
      id: "super-mario:http:GET:/v1/customerAction/queryCustomerDetailsByContact.json:queryCustomerDetailsByContact",
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
      methodName: "queryCustomerDetailsByContact",
      sqlFallback: { database: "super_mario", table: "customer", hint: "phone" },
      baseUrlEnvKey: "DFC_API_SUPER_MARIO_BASE_URL",
      http: {
        method: "GET",
        path: "/v1/customerAction/queryCustomerDetailsByContact.json",
      },
    } satisfies DfcApiEndpoint;

    const preview = previewBackendApiCall(endpoint, { phone: "13166990795" });
    expect(preview?.query?.contact).toBe("13166990795");
    expect(preview?.url).toContain("contact=13166990795");
  });
});

describe("isBotWallWafBlock", () => {
  it("flags bot-wall 403 WAF payloads", () => {
    expect(
      isBotWallWafBlock(
        403,
        "https://huaguo.stable.dasouche.net/bot-wall/v1/carDetailsApi/carDetailInfoV2.json",
        { msg: "Bad Request", code: "500", success: false },
      ),
    ).toBe(true);
    expect(
      isBotWallWafBlock(
        403,
        "https://huaguo.stable.dasouche.net/mini/car/detailV2.json",
        { success: false },
      ),
    ).toBe(false);
  });
});

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

  it("builds crazy_kartrider plate sql fallback", () => {
    const carEndpoint = {
      ...endpoint,
      id: "crazyracing-kartrider:http:POST:/web/v3/carViewQuery/queryRecordPageInfo.json:queryRecordPageInfo",
      appCode: "crazyracing-kartrider",
      entity: "car",
      sqlFallback: {
        database: "crazy_kartrider",
        table: "car",
        hint: "WHERE plate_number = ? AND date_delete = 0 LIMIT 20",
      },
      baseUrlEnvKey: "DFC_API_KARTRIDER_BASE_URL",
    } satisfies DfcApiEndpoint;
    const sql = buildSuggestedSqlForEndpoint(carEndpoint, { plate: "皖JV066M" });
    expect(sql).toMatch(/`crazy_kartrider`\.`car`/);
    expect(sql).toContain("plate_number = '皖JV066M'");
    expect(sql).toContain("date_delete = 0");
  });

  it("builds danube-authorization open user sql when table is wildcard", () => {
    const authEndpoint = {
      ...endpoint,
      id: "danube-authorization:http:GET:/open/user/getByCode:getByCode",
      appCode: "danube-authorization",
      entity: "cheniu_user",
      http: { method: "GET", path: "/open/user/getByCode" },
      sqlFallback: {
        database: "matador",
        table: "*",
        hint: "route_question",
      },
      baseUrlEnvKey: "DFC_API_DANUBE_AUTHORIZATION_BASE_URL",
    } satisfies DfcApiEndpoint;
    const sql = buildSuggestedSqlForEndpoint(authEndpoint, { phone: "16612341112" });
    expect(sql).toMatch(/`matador`\.`cheniu_user`/);
    expect(sql).toContain("16612341112");
  });

  it("builds danube-megatron user sql against matador.cheniu_user", () => {
    const megatronEndpoint = {
      ...endpoint,
      id: "danube-megatron:http:GET:/user/getById:getById",
      appCode: "danube-megatron",
      entity: "cheniu_user",
      http: { method: "GET", path: "/user/getById" },
      sqlFallback: {
        database: "danube_megatron",
        table: "*",
        hint: "route_question",
      },
      baseUrlEnvKey: "DFC_API_DANUBE_MEGATRON_BASE_URL",
    } satisfies DfcApiEndpoint;
    const sql = buildSuggestedSqlForEndpoint(megatronEndpoint, {
      recordId: "U123",
    });
    expect(sql).toMatch(/`matador`\.`cheniu_user`/);
    expect(sql).toContain("U123");
  });

  it("builds crazyracing-kartrider car sql by recordId when table is wildcard", () => {
    const kartriderEndpoint = {
      ...endpoint,
      id: "crazyracing-kartrider:http:GET:/v1/grossProfit/getCarGrossProfit.json:getCarGrossProfit",
      appCode: "crazyracing-kartrider",
      entity: "car",
      http: { method: "GET", path: "/v1/grossProfit/getCarGrossProfit.json" },
      sqlFallback: {
        database: "crazy_kartrider",
        table: "*",
        hint: "route_question",
      },
      baseUrlEnvKey: "DFC_API_KARTRIDER_BASE_URL",
    } satisfies DfcApiEndpoint;
    const sql = buildSuggestedSqlForEndpoint(kartriderEndpoint, {
      recordId: "LYa4PsNN4J",
    });
    expect(sql).toMatch(/`crazy_kartrider`\.`car`/);
    expect(sql).toContain("LYa4PsNN4J");
    expect(sql).toContain("date_delete = 0");
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

describe("resolveDfcApiEndpointBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to inferred per-app env when catalog still points at GATEWAY", () => {
    vi.stubEnv("DFC_API_GATEWAY_BASE_URL", "");
    vi.stubEnv(
      "DFC_API_DANUBE_PLUG_IN_WEB_BASE_URL",
      "https://danube-plug-in-web.dasouche.net",
    );
    const endpoint = {
      appCode: "danube-plug-in-web",
      baseUrlEnvKey: "DFC_API_GATEWAY_BASE_URL",
    };
    expect(resolveDfcApiEndpointBaseUrl(endpoint)).toBe(
      "https://danube-plug-in-web.dasouche.net",
    );
    expect(isDfcApiEndpointEnvConfigured(endpoint)).toBe(true);
  });
});

describe("inferDefaultBaseUrlForApp", () => {
  it("uses stable host for apps without an exception", async () => {
    const { inferDefaultBaseUrlForApp } = await import(
      "@/lib/analytics/backend-api-client"
    );
    expect(inferDefaultBaseUrlForApp("anduin")).toBe(
      "https://anduin.stable.dasouche.net",
    );
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
    expect(
      assertTestSafeUpstreamUrl(
        "https://ai-privacy-number.dasouche-inc.net/aiprivacynumber/controller/bindDetailController/selectOne.json",
      ),
    ).toBeUndefined();
  });

  it("allows souche.com outside test env", () => {
    vi.stubEnv("ANALYTICS_MYSQL_ENV", "prod");
    expect(assertTestSafeUpstreamUrl("https://matador.souche.com/car/detail")).toBeUndefined();
  });
});

describe("callBackendApi skipHttpProbe", () => {
  it("skips undeployed customer-biz-data-system without HTTP", async () => {
    const endpoint = {
      id: "customer-biz-data-system:http:GET:/dc/data:data",
      appCode: "customer-biz-data-system",
      repo: "customer-biz-data-system",
      entity: "general",
      title: "dc data",
      description: "",
      matchPatterns: [],
      kind: "http",
      readOnly: true,
      preferOverSql: false,
      keywords: [],
      sqlFallback: { database: "ghm", table: "udesk_customer", hint: "WHERE phone = ?" },
      baseUrlEnvKey: "DFC_API_CUSTOMER_BIZ_DATA_SYSTEM_BASE_URL",
      http: { method: "GET", path: "/dc/data", queryParams: { phone: "phone" } },
    } satisfies DfcApiEndpoint;

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await callBackendApi(endpoint, { phone: "16612341112" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/customer-biz-data-system/);
    expect(result.suggestedSql).toContain("`ghm`");
    fetchSpy.mockRestore();
  });

  it("skips undeployed danube-megatron without HTTP", async () => {
    const endpoint = {
      id: "danube-megatron:http:GET:/user/getById:getById",
      appCode: "danube-megatron",
      repo: "danube/danube-megatron",
      entity: "cheniu_user",
      title: "getById",
      description: "",
      matchPatterns: [],
      kind: "http",
      readOnly: true,
      preferOverSql: false,
      keywords: [],
      sqlFallback: { database: "danube_megatron", table: "*", hint: "route_question" },
      baseUrlEnvKey: "DFC_API_DANUBE_MEGATRON_BASE_URL",
      http: { method: "GET", path: "/user/getById" },
    } satisfies DfcApiEndpoint;

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await callBackendApi(endpoint, { recordId: "U123" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/danube-megatron/);
    expect(result.suggestedSql).toMatch(/`matador`\.`cheniu_user`/);
    fetchSpy.mockRestore();
  });
});

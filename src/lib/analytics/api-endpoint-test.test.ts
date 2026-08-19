import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";

import {
  resetDfcApiCatalogCache,
  setDfcApiCatalogCache,
} from "@/lib/analytics/api-catalog-store";
import { loadDfcApiCatalogFromJsonFile } from "@/lib/analytics/dfc-api-catalog-json";
import {
  previewDfcApiEndpointRequest,
  testDfcApiEndpoint,
} from "@/lib/analytics/api-endpoint-test";
import { runWithSsoRequestContext } from "@/lib/security/sso-context";

describe("api-endpoint-test", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("skips HTTP probe for undeployed danube-megatron even if catalog still has it", async () => {
    const endpoints = loadDfcApiCatalogFromJsonFile();
    const synthetic = {
      id: "danube-megatron:http:GET:/user/getById:getById",
      appCode: "danube-megatron",
      repo: "danube/danube-megatron",
      entity: "cheniu_user",
      title: "getById",
      description: "",
      matchPatterns: [],
      kind: "http" as const,
      readOnly: true,
      preferOverSql: false,
      http: { method: "GET" as const, path: "/user/getById" },
      keywords: [],
      sqlFallback: { database: "danube_megatron", table: "*", hint: "" },
      baseUrlEnvKey: "DFC_API_DANUBE_MEGATRON_BASE_URL",
    };
    setDfcApiCatalogCache([...endpoints, synthetic], {
      total: endpoints.length + 1,
    });
    const result = await testDfcApiEndpoint(synthetic.id);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/danube-megatron/);
    expect(result.message).toMatch(/503/);
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
    expect(initJob.message).toMatch(/跳过/);
  });

  it("skips kartrider grossProfit and carCommand write endpoints in batch probe", async () => {
    const result = await testDfcApiEndpoint(
      "crazyracing-kartrider:http:GET:/v1/grossProfit/getCarGrossProfit.json:getCarGrossProfit",
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/PATH_NOT_EXISTS|不宜 HTTP|跳过/);
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

  it("fills missing shop and org from logged-in SSO profile during preview", async () => {
    const endpoints = loadDfcApiCatalogFromJsonFile();
    const synthetic = {
      id: "demo:http:GET:/v1/demo/profile.json:profile",
      appCode: "demo",
      repo: "demo",
      entity: "general",
      title: "profile",
      description: "",
      matchPatterns: [],
      kind: "http" as const,
      readOnly: true,
      preferOverSql: false,
      http: {
        method: "GET" as const,
        path: "/v1/demo/profile.json",
        queryParams: {
          shopCode: "shopCode",
          orgCode: "orgCode",
        },
      },
      keywords: [],
      sqlFallback: { database: "demo", table: "demo", hint: "" },
      baseUrlEnvKey: "DFC_API_DEMO_BASE_URL",
    };
    setDfcApiCatalogCache([...endpoints, synthetic], { total: endpoints.length + 1 });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("queryLoginUserInfo")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                loginUserId: "ACC123",
                loginUserName: "贾先涛",
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("findUserInfoByToken")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                shopCode: "01161577",
                orgCode: "ORG9",
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      }),
    );

    const preview = await runWithSsoRequestContext(
      {
        token: "token-preview",
        tokenHeader: "Souche-Security-Token",
        cookieHeader: "_security_token=token-preview",
      },
      () => previewDfcApiEndpointRequest(synthetic.id),
    );

    expect(preview?.query).toMatchObject({
      shopCode: "01161577",
      orgCode: "ORG9",
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  isDfcApiCatalogNoiseEndpoint,
  resolveEndpointBaseUrlEnvKey,
} from "@/lib/analytics/dfc-api-catalog-noise";

describe("dfc-api-catalog-noise", () => {
  it("treats example web controllers as noise", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "ai-open-platform",
        className: "WebController",
        sourceFile:
          "ai-open-platform/server/src/main/java/com/souche/ai/open/platform/example/web/WebController.java",
        http: { path: "/web/echo" },
      }),
    ).toBe(true);
  });

  it("treats springboot-demo generator controllers as noise", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-megatron",
        className: "UserController",
        sourceFile:
          "danube-megatron/megatron-generator/megatron-generator-mybatisplus-maven-plugin-springboot-demo/src/main/java/com/souche/template/controller/UserController.java",
        http: { path: "/user/getById" },
      }),
    ).toBe(true);
  });

  it("treats swagger-core generic dubbo invoke as noise", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-megatron",
        className: "ApiInvokeController",
        sourceFile:
          "danube-megatron/megatron-swagger/megatron-swagger-core/src/main/java/com/souche/megatron/swagger/core/web/ApiInvokeController.java",
        http: { path: "/dubbo/{classSimpleName}/{methodName}" },
      }),
    ).toBe(true);
  });

  it("keeps business endpoints", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "super-mario",
        className: "CustomerAction",
        sourceFile: "gourd/super-mario/src/main/java/CustomerAction.java",
        http: { path: "/v1/customerAction/queryCustomerDetailsByContact.json" },
      }),
    ).toBe(false);
  });

  it("drops retired commented IdleFish backup mappings", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "matador",
        className: "IdleFishBackupApi",
        http: {
          path: "/api/backup/idlefish/IdleFishBackupApi/changeIdleFishAccount",
        },
      }),
    ).toBe(true);
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "matador",
        className: "IdleFishBackupApi",
        http: {
          path: "/api/backup/idlefish/IdleFishBackupApi/verifyIdleFishyAccountAndSynchronizeCar",
        },
      }),
    ).toBe(true);
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "matador",
        className: "IdleFishBackupApi",
        http: {
          path: "/api/backup/idlefish/IdleFishBackupApi/verifyIdleFishAccountAndSynchronizeCarByJob",
        },
      }),
    ).toBe(false);
  });

  it("rewrites gateway fallback env keys to per-app keys", () => {
    expect(
      resolveEndpointBaseUrlEnvKey("danube-plug-in-web", "DFC_API_GATEWAY_BASE_URL"),
    ).toBe("DFC_API_DANUBE_PLUG_IN_WEB_BASE_URL");
  });
});

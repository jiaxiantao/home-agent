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

  it("drops huaguo wrong optimus relative paths", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "huaguo",
        className: "MenuApi",
        http: { path: "/queryBrandList" },
      }),
    ).toBe(true);
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "huaguo",
        className: "MenuApi",
        http: { path: "/v1/menuApi/queryBrandList.json" },
      }),
    ).toBe(false);
  });

  it("drops danube-electronic-contract stale optimus paths from old catalog", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-electronic-contract",
        className: "ESignHomeController",
        http: { path: "/getContractList" },
      }),
    ).toBe(true);
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-electronic-contract",
        className: "ESignFlowController",
        http: { path: "/flow/contractDetail" },
      }),
    ).toBe(true);
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-electronic-contract",
        className: "EContractController",
        http: { path: "/v1/eContractController/abandonContract.json" },
      }),
    ).toBe(true);
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-electronic-contract",
        className: "ESignFlowController",
        http: {
          path: "/danube/electronic/contract/web/econtract/esign/eSignFlowController/flow/contractDetail.json",
        },
      }),
    ).toBe(false);
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-electronic-contract",
        className: "EContractCallbackController",
        http: { path: "/callback/getDraftInfo" },
      }),
    ).toBe(false);
  });

  it("keeps spring REST paths on other apps", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "customer-biz-data-system",
        className: "UdeskAgentRolesController",
        http: { path: "/udeskAgentRoles" },
      }),
    ).toBe(false);
  });

  it("drops stateful danube plug-in web v1 actions", () => {
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-plug-in-web",
        className: "AccountAction",
        sourceFile:
          "danube-plug-in-web/danube-plug-in-web/src/main/java/com/souche/danube/plugin/json/autohome/AccountAction.java",
        http: { path: "/v1/accountAction/hasPermission.json" },
      }),
    ).toBe(true);
    expect(
      isDfcApiCatalogNoiseEndpoint({
        appCode: "danube-plug-in-web",
        className: "EstimatePriceApi",
        sourceFile:
          "danube-plug-in-web/danube-plug-in-web/src/main/java/com/souche/danube/plugin/json/estimate/EstimatePriceApi.java",
        http: { path: "/estimatePrice/queryBrands" },
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

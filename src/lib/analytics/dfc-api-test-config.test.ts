import { describe, expect, it } from "vitest";
import fs from "node:fs";

import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import { loadDfcApiCatalogFromJsonFile } from "@/lib/analytics/dfc-api-catalog-json";
import { inferDefaultTestConfig } from "@/lib/analytics/dfc-api-test-config";

describe("dfc-api-test-config", () => {
  it("infers POST body from Java DTO for addLog", () => {
    const endpoint: DfcApiEndpoint = {
      id: "ai-backend-algorithm:http:POST:/algorithmLog/addLog.json:add",
      appCode: "ai-backend-algorithm",
      repo: "ai-backend-algorithm",
      entity: "general",
      title: "add",
      description: "算法日志上报",
      matchPatterns: [],
      kind: "http",
      readOnly: false,
      preferOverSql: false,
      http: {
        method: "POST",
        path: "/algorithmLog/addLog.json",
      },
      keywords: [],
      methodName: "add",
      className: "AlgorithmLogController",
      sourceFile:
        "ai-backend-algorithm/server/src/main/java/com/souche/ai/aibackendalgorithm/controller/AlgorithmLogController.java",
      sqlFallback: { database: "*", table: "*", hint: "manual" },
      baseUrlEnvKey: "DFC_API_AI_BACKEND_ALGORITHM_BASE_URL",
    };

    const config = inferDefaultTestConfig(endpoint, {
      backendRoot: "/Users/xiantaojia/Documents/dafengche-backend",
    });

    expect(config.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(config.body).toMatchObject({
      businessId: expect.any(String),
      params: expect.any(String),
      source: "test",
    });
  });

  it("infers CRM query params from Java @Param", () => {
    const endpoint: DfcApiEndpoint = {
      id: "super-mario:http:GET:/v1/customerAction/crmQueryCustomerInfo.json:crmQueryCustomerInfo",
      appCode: "super-mario",
      repo: "super-mario",
      entity: "crm_customer",
      title: "crmQueryCustomerInfo",
      description: "CRM 客户详情",
      matchPatterns: [],
      kind: "http",
      readOnly: true,
      preferOverSql: true,
      http: {
        method: "GET",
        path: "/v1/customerAction/crmQueryCustomerInfo.json",
        queryParams: { recordId: "recordId" },
      },
      keywords: [],
      methodName: "crmQueryCustomerInfo",
      className: "CustomerAction",
      sourceFile:
        "super-mario/web/src/main/java/com/jiaxuan/supermario/json/v1/CustomerAction.java",
      sqlFallback: { database: "super_mario", table: "customer", hint: "manual" },
      baseUrlEnvKey: "DFC_API_SUPER_MARIO_BASE_URL",
    };

    const config = inferDefaultTestConfig(endpoint, {
      backendRoot: "/Users/xiantaojia/Documents/dafengche-backend",
    });

    expect(config.params.recordId).toBe("LYa4PsNN4J");
    expect(config.query.recordId).toBe("LYa4PsNN4J");
    expect(config.headers._source_code).toBe("WEB");
  });

  it(
    "infers danube-league POST bodies from Java DTOs (Lombok / @Validated / List)",
    () => {
    const backendRoot = "/Users/xiantaojia/Documents/dafengche-backend";
    if (!fs.existsSync(backendRoot)) {
      return;
    }

    const list = loadDfcApiCatalogFromJsonFile().find(
      (item) => item.id === "danube-league:http:POST:/car/list:list",
    )!;
    const batch = loadDfcApiCatalogFromJsonFile().find(
      (item) => item.id === "danube-league:http:POST:/car/batchCreateLeagueDX:batchCreateLeagueDX",
    )!;
    const join = loadDfcApiCatalogFromJsonFile().find(
      (item) => item.id === "danube-league:http:POST:/league/join:join",
    )!;

    const listConfig = inferDefaultTestConfig(list, { backendRoot });
    expect(listConfig.body).toMatchObject({ pageSize: 20, shopCode: expect.any(String) });

    const batchConfig = inferDefaultTestConfig(batch, { backendRoot });
    expect(Array.isArray(batchConfig.body)).toBe(true);

    const joinConfig = inferDefaultTestConfig(join, { backendRoot });
    expect(joinConfig.body).toMatchObject({ leagueId: expect.any(String) });
    },
    15_000,
  );

  it(
    "infers danube-authorization request params, inline bodies, and secrets",
    () => {
      const backendRoot = "/Users/xiantaojia/Documents/dafengche-backend";
      if (!fs.existsSync(backendRoot)) {
        return;
      }

      const catalog = loadDfcApiCatalogFromJsonFile();
      const reenable = catalog.find(
        (item) => item.id === "danube-authorization:http:GET:/init/version/reenable:reenableVersion",
      )!;
      const deleteUser = catalog.find(
        (item) => item.id === "danube-authorization:http:POST:/danubeAdmin/deleteUser:deleteUser",
      )!;
      const migrate = catalog.find(
        (item) => item.id === "danube-authorization:http:POST:/DataMigration/migrate:migrate",
      )!;
      const userInitRole = catalog.find(
        (item) => item.id === "danube-authorization:http:POST:/role/userInitRole:userInitRole",
      )!;

      const reenableConfig = inferDefaultTestConfig(reenable, { backendRoot });
      expect(reenableConfig.query.version_id).toBe("LYa4PsNN4J");
      expect(reenableConfig.headers.tt).toBe("QHQ4utc5KuVcW4AIpB3vk7pRNfjOGLaB");

      const deleteUserConfig = inferDefaultTestConfig(deleteUser, { backendRoot });
      expect(deleteUserConfig.headers.tt).toBe("cquh79awAaZaybt6vtnKV43jAfuZXGCB");
      expect(deleteUserConfig.body).toMatchObject({
        userId: [],
      });

      const migrateConfig = inferDefaultTestConfig(migrate, { backendRoot });
      expect(migrateConfig.body).toMatchObject({
        tt: "QHQ4utc5KuVcW4AIpB3vk7pRNfjOGLaB",
        shopCodes: [],
        versionId: expect.any(String),
      });

      const userInitRoleConfig = inferDefaultTestConfig(userInitRole, { backendRoot });
      expect(userInitRoleConfig.body).toMatchObject({
        token: "tGWJmDMZ9kFfSaSmS",
        userIds: [],
      });
    },
    15_000,
  );
});

import { describe, expect, it } from "vitest";

import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
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
});

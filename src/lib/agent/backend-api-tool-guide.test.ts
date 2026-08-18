import { describe, expect, it } from "vitest";

import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import {
  buildCallBackendApiArgsFromMatch,
  enrichBackendApiCallResult,
  isEndpointHttpCallable,
  nextCallableApiMatch,
  resolveApiFallbackPlan,
  resolveBackendApiNextAction,
} from "@/lib/agent/backend-api-tool-guide";

const customerEndpoint: DfcApiEndpoint = {
  id: "super-mario:http:GET:/queryCustomerDetailsByContact:queryCustomerDetailsByContact",
  appCode: "super-mario",
  repo: "gourd/super-mario",
  entity: "crm_customer",
  kind: "http",
  methodName: "queryCustomerDetailsByContact",
  className: "CustomerAction",
  title: "CRM 客户详情（手机号/微信号）",
  description: "test",
  readOnly: true,
  preferOverSql: true,
  keywords: [],
  matchPatterns: [],
  baseUrlEnvKey: "DFC_API_SUPER_MARIO_BASE_URL",
  http: {
    method: "GET",
    path: "/v1/customerAction/queryCustomerDetailsByContact.json",
    queryParams: { contact: "phone" },
  },
  sqlFallback: {
    database: "super_mario",
    table: "customer",
    hint: "WHERE phone = ? LIMIT 20",
  },
};

describe("backend-api-tool-guide", () => {
  it("marks endpoint callable when phone param is present", () => {
    expect(
      isEndpointHttpCallable(customerEndpoint, { phone: "16612341112" }),
    ).toBe(true);
  });

  it("builds call args with question and plate body for kartrider", () => {
    const match = {
      endpoint: {
        ...customerEndpoint,
        http: {
          method: "POST" as const,
          path: "/web/v3/carViewQuery/queryRecordPageInfo.json",
          bodyTemplate: { keywords: "{{plate}}" },
        },
      },
      score: 10,
      reasons: [],
      extractedParams: { plate: "浙A12345" },
      httpCallable: true,
    };
    expect(buildCallBackendApiArgsFromMatch(match, "查车牌浙A12345")).toMatchObject({
      plate: "浙A12345",
      body: { keywords: "浙A12345" },
    });
  });

  it("resolves propose_sql next action when suggestedSql exists", () => {
    expect(
      resolveBackendApiNextAction({
        status: "error",
        endpointId: customerEndpoint.id,
        appCode: "super-mario",
        message: "upstream",
        suggestedSql: "SELECT 1",
      }),
    ).toBe("propose_sql");
  });

  it("enriches call result with nextAction and hints", () => {
    const enriched = enrichBackendApiCallResult(
      {
        status: "error",
        failureKind: "auth",
        endpointId: customerEndpoint.id,
        appCode: "super-mario",
        message: "no sso",
      },
      { endpoint: customerEndpoint },
    );
    expect(enriched.nextAction).toBe("sync_sso");
    expect(enriched.callHints?.length).toBeGreaterThan(0);
  });

  it("forces propose_sql plan after failed call_backend_api", () => {
    const plan = resolveApiFallbackPlan("查客户", [
      {
        tool: "call_backend_api",
        args: { endpointId: customerEndpoint.id },
        output: "failed",
        data: {
          status: "error",
          suggestedSql: "SELECT id FROM customer LIMIT 1",
          nextAction: "propose_sql",
        },
      },
    ]);
    expect(plan?.action).toBe("tool");
    if (plan?.action === "tool") {
      expect(plan.tool).toBe("propose_sql");
    }
  });

  it("picks next uncalled callable match", () => {
    const matches = [
      {
        endpoint: customerEndpoint,
        score: 10,
        reasons: [],
        extractedParams: { phone: "16612341112" },
        httpCallable: true,
      },
    ];
    const next = nextCallableApiMatch(matches, new Set(), { phone: "16612341112" });
    expect(next?.endpoint.id).toBe(customerEndpoint.id);
  });
});

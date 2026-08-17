import { describe, expect, it } from "vitest";

import { inferDefaultTestParams } from "@/lib/analytics/dfc-api-default-params";
import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";

describe("dfc-api-default-params", () => {
  it("infers phone for CRM contact endpoint", () => {
    const endpoint: DfcApiEndpoint = {
      id: "demo",
      appCode: "super-mario",
      repo: "super-mario",
      entity: "customer",
      title: "queryCustomerDetailsByContact",
      description: "按手机号查客户",
      matchPatterns: [],
      kind: "http",
      readOnly: true,
      preferOverSql: true,
      http: {
        method: "GET",
        path: "/v1/customerAction/queryCustomerDetailsByContact.json",
        queryParams: { contact: "phone" },
      },
      keywords: [],
      sqlFallback: { database: "*", table: "*", hint: "manual" },
      baseUrlEnvKey: "DFC_API_SUPER_MARIO_BASE_URL",
    };

    expect(inferDefaultTestParams(endpoint)).toMatchObject({
      phone: "16612341112",
    });
  });
});

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

  it("rewrites gateway fallback env keys to per-app keys", () => {
    expect(
      resolveEndpointBaseUrlEnvKey("danube-plug-in-web", "DFC_API_GATEWAY_BASE_URL"),
    ).toBe("DFC_API_DANUBE_PLUG_IN_WEB_BASE_URL");
  });
});

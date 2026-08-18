import { describe, expect, it } from "vitest";

import {
  alternateTestRequestUrls,
  inferDefaultBaseUrlForApp,
  resolveDirectHttpPathForApp,
  shouldSkipHttpProbe,
  shouldSkipHttpProbeEndpoint,
  shouldStripGatewayV1Prefix,
} from "@/lib/analytics/dfc-api-test-hosts";

describe("dfc-api-test-hosts", () => {
  it("defaults unknown apps to stable dasouche.net", () => {
    expect(inferDefaultBaseUrlForApp("anduin")).toBe(
      "https://anduin.stable.dasouche.net",
    );
    expect(inferDefaultBaseUrlForApp("cannon")).toBe(
      "https://cannon.stable.dasouche.net",
    );
  });

  it("keeps probed exceptions", () => {
    expect(inferDefaultBaseUrlForApp("super-mario")).toBe(
      "http://super-mario.stable.dasouche.net",
    );
    expect(inferDefaultBaseUrlForApp("matador")).toBe("http://matador.dasouche.net");
    expect(inferDefaultBaseUrlForApp("ai-backend-algorithm")).toBe(
      "https://ai-backend-algorithm.dasouche.net",
    );
    expect(inferDefaultBaseUrlForApp("ai-privacy-number")).toBe(
      "https://ai-privacy-number.dasouche-inc.net",
    );
    expect(inferDefaultBaseUrlForApp("danube-admin-web")).toBe(
      "https://danube-admin-web.dasouche-inc.net",
    );
  });

  it("strips /v1 gateway prefix for direct danube-admin-web calls", () => {
    expect(shouldStripGatewayV1Prefix("danube-admin-web")).toBe(true);
    expect(shouldStripGatewayV1Prefix("super-mario")).toBe(false);
    expect(
      resolveDirectHttpPathForApp(
        "danube-admin-web",
        "/v1/dictionary/functions.json",
        "https://danube-admin-web.dasouche-inc.net",
      ),
    ).toBe("/dictionary/functions.json");
    expect(
      resolveDirectHttpPathForApp(
        "super-mario",
        "/v1/customerAction/crmQueryCustomerInfo.json",
        "http://super-mario.stable.dasouche.net",
      ),
    ).toBe("/v1/customerAction/crmQueryCustomerInfo.json");
  });

  it("keeps /v1 when routing through gateway base", () => {
    process.env.DFC_API_GATEWAY_BASE_URL = "https://gateway-test.example.internal";
    expect(
      resolveDirectHttpPathForApp(
        "danube-admin-web",
        "/v1/dictionary/functions.json",
        "https://gateway-test.example.internal/danube-admin-web",
      ),
    ).toBe("/v1/dictionary/functions.json");
    delete process.env.DFC_API_GATEWAY_BASE_URL;
  });

  it("skips HTTP probe for undeployed cheniu-user and customer-biz-data-system", () => {
    expect(shouldSkipHttpProbe("cheniu-user")).toBe(true);
    expect(shouldSkipHttpProbe("customer-biz-data-system")).toBe(true);
    expect(shouldSkipHttpProbe("anduin")).toBe(false);
  });

  it("skips long-running matador idlefish init endpoint", () => {
    expect(
      shouldSkipHttpProbeEndpoint(
        "matador:http:GET:/api/backup/idlefish/IdleFishBackupApi/initCarSourceDivision:initCarSourceDivision",
      ),
    ).toBe(true);
    expect(
      shouldSkipHttpProbeEndpoint(
        "huaguo:http:GET:/bot-wall/v1/carDetailsApi/carDetailInfoV2.json:carDetailInfoV2Waf",
      ),
    ).toBe(true);
    expect(shouldSkipHttpProbeEndpoint("matador:http:GET:/api/common/VinApi/checkVin:checkVin")).toBe(
      false,
    );
  });

  it("alternates bare dasouche.net to stable then inc", () => {
    const alts = alternateTestRequestUrls(
      "https://anduin.dasouche.net/crm/operation/getNotifyInfo",
    );
    expect(alts[0]).toBe(
      "https://anduin.stable.dasouche.net/crm/operation/getNotifyInfo",
    );
    expect(alts).toContain(
      "https://anduin.dasouche-inc.net/crm/operation/getNotifyInfo",
    );
    expect(alts).not.toContain(
      "https://anduin.dasouche.net/crm/operation/getNotifyInfo",
    );
  });
});

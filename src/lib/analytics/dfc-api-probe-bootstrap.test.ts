import { describe, expect, it, afterEach, vi } from "vitest";

import {
  applyProbeBootstrapToQuery,
  clearDfcApiProbeBootstrapCacheForTest,
  isProbePlaceholderValue,
  resolveDfcApiProbeBootstrap,
} from "@/lib/analytics/dfc-api-probe-bootstrap";

describe("dfc-api-probe-bootstrap", () => {
  afterEach(() => {
    clearDfcApiProbeBootstrapCacheForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects demo placeholders", () => {
    expect(isProbePlaceholderValue("demo")).toBe(true);
    expect(isProbePlaceholderValue("demo_shop")).toBe(true);
    expect(isProbePlaceholderValue("brand-1090")).toBe(false);
  });

  it("chains brand and series from estimatePrice endpoints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("queryBrands")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: [{ code: "brand-1090", name: "AITO问界" }],
            }),
            { status: 200 },
          );
        }
        if (url.includes("querySeries")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: [{ code: "series-52804", name: "问界M5" }],
            }),
            { status: 200 },
          );
        }
        if (url.includes("queryModels")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: [{ code: "386496", name: "2024款 问界M5" }],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      }),
    );

    const bootstrap = await resolveDfcApiProbeBootstrap({
      token: "token-bootstrap",
      tokenHeader: "Souche-Security-Token",
      cookieHeader: "_security_token=token-bootstrap",
    });

    expect(bootstrap).toMatchObject({
      brandCode: "brand-1090",
      seriesCode: "series-52804",
      modelCode: "386496",
      linked: true,
    });
  });

  it("replaces demo brandCode in query from bootstrap", () => {
    const query = applyProbeBootstrapToQuery(
      { brandCode: "demo", seriesCode: "demo", cityCode: "demo" },
      {
        brandCode: "brand-1090",
        seriesCode: "series-52804",
        linked: true,
      },
    );

    expect(query).toMatchObject({
      brandCode: "brand-1090",
      seriesCode: "series-52804",
      cityCode: "demo",
    });
  });
});

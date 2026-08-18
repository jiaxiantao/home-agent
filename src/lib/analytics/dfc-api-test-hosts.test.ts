import { describe, expect, it } from "vitest";

import {
  alternateTestRequestUrls,
  inferDefaultBaseUrlForApp,
  shouldSkipHttpProbe,
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
  });

  it("skips HTTP probe for undeployed cheniu-user", () => {
    expect(shouldSkipHttpProbe("cheniu-user")).toBe(true);
    expect(shouldSkipHttpProbe("anduin")).toBe(false);
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

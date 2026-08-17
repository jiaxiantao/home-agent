import { describe, expect, it } from "vitest";

import {
  findDfcAppRegistryOption,
  inferBaseUrlEnvKeyForAppCode,
  listDfcAppRegistryOptions,
  listDfcAppServiceOptions,
  resolveAppDefaultDomain,
} from "@/lib/analytics/dfc-app-registry";

describe("dfc-app-registry", () => {
  it("lists known apps with baseUrlEnvKey", () => {
    const options = listDfcAppRegistryOptions();
    expect(options.length).toBeGreaterThan(10);
    const kartrider = options.find((item) => item.appCode === "crazyracing-kartrider");
    expect(kartrider?.baseUrlEnvKey).toBe("DFC_API_KARTRIDER_BASE_URL");
  });

  it("uses stable host hint when env is unset", () => {
    expect(
      resolveAppDefaultDomain("crazyracing-kartrider", "DFC_API_KARTRIDER_BASE_URL"),
    ).toBe("https://crazyracing-kartrider.stable.dasouche.net");
  });

  it("finds registry option by appCode", () => {
    const option = findDfcAppRegistryOption("ai-open-platform");
    expect(option?.baseUrlEnvKey).toBe("DFC_API_AI_OPEN_PLATFORM_BASE_URL");
    expect(option?.defaultDomain).toContain("ai-open-platform");
  });

  it("infers env key for catalog-only apps", () => {
    expect(inferBaseUrlEnvKeyForAppCode("sso-newdfc")).toBe(
      "DFC_API_SSO_NEWDFC_BASE_URL",
    );
  });

  it("lists service options for catalog app codes", () => {
    const options = listDfcAppServiceOptions(["sso-newdfc", "super-mario"]);
    expect(options.some((item) => item.appCode === "sso-newdfc")).toBe(true);
    expect(options.find((item) => item.appCode === "sso-newdfc")?.baseUrlEnvKey).toBe(
      "DFC_API_SSO_NEWDFC_BASE_URL",
    );
  });
});

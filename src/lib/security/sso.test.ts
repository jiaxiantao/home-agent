import { describe, expect, it } from "vitest";

import {
  buildSsoLoginUrl,
  getSsoCookieNames,
  parseCookieValue,
} from "@/lib/security/sso-config";
import {
  extractSsoCredentials,
  hashSsoToken,
} from "@/lib/security/sso-credentials";

describe("sso-config", () => {
  it("builds login url with returnUrl before hash", () => {
    const url = buildSsoLoginUrl("http://localhost:3000/agents");
    expect(url).toContain("returnUrl=");
    expect(url).toContain("#/app/dashboard");
  });

  it("extracts token from Souche security header", () => {
    const headers = new Headers({
      "Souche-Security-Token": "abc123",
    });
    expect(extractSsoCredentials(headers)).toMatchObject({
      token: "abc123",
      tokenHeader: "Souche-Security-Token",
    });
  });

  it("extracts token from sso cookie names", () => {
    const headers = new Headers({
      cookie: "_security_token=token-ext; other=x",
    });
    expect(extractSsoCredentials(headers)).toMatchObject({
      token: "token-ext",
      cookieHeader: "_security_token=token-ext",
    });
  });

  it("parses cookie value", () => {
    expect(parseCookieValue("a=1; _security_token=hello%21", "_security_token")).toBe(
      "hello!",
    );
  });

  it("hashes token deterministically", () => {
    expect(hashSsoToken("abc")).toHaveLength(16);
    expect(hashSsoToken("abc")).toBe(hashSsoToken("abc"));
    expect(getSsoCookieNames()).toContain("_security_token");
  });
});

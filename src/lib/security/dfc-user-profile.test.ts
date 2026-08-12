import { describe, expect, it, vi, afterEach } from "vitest";

import {
  DFC_SSO_SESSION_COOKIE,
  DFC_SSO_SESSION_COOKIE_LEGACY,
  resolveDfcUserProfile,
  resolveSsoCredentialsFromRequest,
} from "@/lib/security/dfc-user-profile";

describe("dfc-user-profile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads _security_token session cookie as sso credentials", () => {
    const headers = new Headers({
      cookie: `${DFC_SSO_SESSION_COOKIE}=abc123`,
    });
    expect(resolveSsoCredentialsFromRequest(headers)).toMatchObject({
      token: "abc123",
      tokenHeader: "Souche-Security-Token",
    });
  });

  it("prefers _security_token over dev env token", () => {
    vi.stubEnv("DFC_API_DEV_SSO_TOKEN", "env-token-should-not-win");
    const headers = new Headers({
      cookie: `${DFC_SSO_SESSION_COOKIE}=sidebar-token`,
    });
    expect(resolveSsoCredentialsFromRequest(headers)).toMatchObject({
      token: "sidebar-token",
    });
  });

  it("reads legacy dfc_sso_token cookie during migration", () => {
    const headers = new Headers({
      cookie: `${DFC_SSO_SESSION_COOKIE_LEGACY}=legacy-token`,
    });
    expect(resolveSsoCredentialsFromRequest(headers)).toMatchObject({
      token: "legacy-token",
      cookieHeader: `${DFC_SSO_SESSION_COOKIE}=legacy-token`,
    });
  });

  it("falls back to dev env token when sidebar cookie is absent", () => {
    vi.stubEnv("DFC_API_DEV_SSO_TOKEN", "env-fallback-token");
    const headers = new Headers();
    expect(resolveSsoCredentialsFromRequest(headers)).toMatchObject({
      token: "env-fallback-token",
    });
  });

  it("merges matador workbench user profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("queryLoginUserInfo")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                loginUserId: "ACC123",
                loginUserName: "贾先涛",
                loginUserPhone: "13800000000",
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("findUserInfoByToken")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                account: "ACC123",
                nickname: "贾先涛",
                shopCode: "01161577",
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ success: false }), {
          status: 404,
        });
      }),
    );

    const headers = new Headers({
      cookie: `${DFC_SSO_SESSION_COOKIE}=token-xyz`,
    });
    const profile = await resolveDfcUserProfile(headers);
    expect(profile).toMatchObject({
      linked: true,
      userId: "ACC123",
      userName: "贾先涛",
      shopCode: "01161577",
    });
  });
});

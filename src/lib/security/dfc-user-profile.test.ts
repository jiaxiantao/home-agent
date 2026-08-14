import { describe, expect, it, vi, afterEach } from "vitest";

import {
  applyLoggedInUserToApiParams,
  applyLoggedInUserToBody,
  applyLoggedInUserToQuery,
  clearDfcUserProfileCacheForTest,
  DFC_SSO_SESSION_COOKIE,
  DFC_SSO_SESSION_COOKIE_LEGACY,
  forgetDfcUserProfile,
  getCachedDfcUserProfile,
  resolveDfcUserProfile,
  resolveSsoCredentialsFromRequest,
} from "@/lib/security/dfc-user-profile";

describe("dfc-user-profile", () => {
  afterEach(() => {
    clearDfcUserProfileCacheForTest();
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

  it("merges workbench shop/group and caches the profile in memory", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("queryLoginUserInfo")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              loginUserId: "ACC123",
              loginUserName: "贾先涛",
              loginUserPhone: "13800000000",
              shopCode: "01161577",
              shopName: "杭州门店",
              groupCode: "G001",
              currentShop: { code: "01161577", groupCode: "G001" },
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
    });
    vi.stubGlobal("fetch", fetchMock);

    const headers = new Headers({
      cookie: `${DFC_SSO_SESSION_COOKIE}=token-xyz`,
    });
    const profile = await resolveDfcUserProfile(headers);
    expect(profile).toMatchObject({
      linked: true,
      userId: "ACC123",
      userName: "贾先涛",
      shopCode: "01161577",
      groupCode: "G001",
      phone: "13800000000",
    });
    expect(profile?.data).toMatchObject({
      loginUserId: "ACC123",
      loginUserName: "贾先涛",
      shopCode: "01161577",
      groupCode: "G001",
    });
    expect(profile?.raw?.queryLoginUserInfo?.payload).toMatchObject({
      success: true,
      data: { loginUserId: "ACC123", groupCode: "G001" },
    });
    expect(profile?.raw?.findUserInfoByToken?.payload).toMatchObject({
      success: true,
      data: { account: "ACC123" },
    });
    expect(profile?.raw?.nameAndPhone?.status).toBe(404);

    const cached = await resolveDfcUserProfile(headers);
    expect(cached?.shopCode).toBe("01161577");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await resolveDfcUserProfile(headers, { refresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("keeps the original SSO payload when workbench only returns name/phone", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("queryLoginUserInfo")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              loginUserId: "NBAJJwvp4lM8c",
              loginUserName: "贾先涛-新大风车-测试",
              loginUserPhone: "13166990790",
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
              id: "NBAJJwvp4lM8c",
              account: "jiaxiantao",
              displayName: "贾先涛-新大风车-测试",
              nickname: "贾先涛-新大风车-测试",
              phone: "13166990790",
              shopCode: "01161577",
              shopName: "杭州门店",
              groupCode: "G001",
              orgId: "ORG9",
              departmentId: "D12",
              departmentName: "技术部",
              email: "jia@souche.com",
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: { name: "贾先涛-新大风车-测试", phone: "13166990790" },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await resolveDfcUserProfile(
      new Headers({ cookie: `${DFC_SSO_SESSION_COOKIE}=token-full` }),
    );
    expect(profile).toMatchObject({
      linked: true,
      shopCode: "01161577",
      shopName: "杭州门店",
      groupCode: "G001",
      orgId: "ORG9",
      departmentName: "技术部",
      email: "jia@souche.com",
    });
    expect(profile?.data?.shopCode).toBe("01161577");
    expect(profile?.raw?.findUserInfoByToken?.payload).toMatchObject({
      data: { shopCode: "01161577", groupCode: "G001" },
    });
  });

  it("fills missing shop/group without overriding question phone", () => {
    const user = {
      linked: true as const,
      shopCode: "01161577",
      groupCode: "G001",
      phone: "13800000000",
    };
    expect(
      applyLoggedInUserToApiParams(
        { phone: "13166990795", shopCode: undefined },
        user,
      ),
    ).toMatchObject({
      phone: "13166990795",
      shopCode: "01161577",
      groupCode: "G001",
    });
    expect(
      applyLoggedInUserToApiParams({ phone: undefined, shopCode: undefined }, user)
        .phone,
    ).toBeUndefined();
    expect(
      applyLoggedInUserToQuery({ shop_code: "", groupCode: "", phone: "" }, user),
    ).toMatchObject({
      shop_code: "01161577",
      shopCode: "01161577",
      groupCode: "G001",
      phone: "13800000000",
    });
    expect(
      applyLoggedInUserToBody({ shop_code: "", ownerPhone: "kept" }, user),
    ).toMatchObject({
      shop_code: "01161577",
      shopCode: "01161577",
      groupCode: "G001",
      ownerPhone: "kept",
    });
  });

  it("forgets cached profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            data: { loginUserId: "ACC123", loginUserName: "贾先涛" },
          }),
          { status: 200 },
        );
      }),
    );
    const headers = new Headers({
      cookie: `${DFC_SSO_SESSION_COOKIE}=token-forget`,
    });
    await resolveDfcUserProfile(headers);
    const sso = resolveSsoCredentialsFromRequest(headers);
    expect(getCachedDfcUserProfile(sso)?.userId).toBe("ACC123");
    forgetDfcUserProfile(sso);
    expect(getCachedDfcUserProfile(sso)).toBeNull();
  });
});

import {
  extractSsoCredentials,
  hashSsoToken,
  type SsoCredentials,
} from "@/lib/security/sso-credentials";
import {
  getDevSsoCredentials,
  parseCookieValue,
} from "@/lib/security/sso-config";
import { getSsoRequestContext } from "@/lib/security/sso-context";

/** 侧栏「同步大风车登录」写入的 Cookie 名，与 Mars `_security_token` 一致 */
export const DFC_SSO_SESSION_COOKIE = "_security_token";

/** 旧版侧栏 Cookie 名，读取/清除时兼容迁移 */
export const DFC_SSO_SESSION_COOKIE_LEGACY = "dfc_sso_token";

const PROFILE_TTL_MS = 10 * 60 * 1000;

type ProfileCacheEntry = {
  profile: DfcUserProfile;
  expiresAt: number;
};

const profileCache = new Map<string, ProfileCacheEntry>();

/** SSO 凭证优先级：侧栏 _security_token → 请求头/浏览器 Mars Cookie → DFC_API_DEV_SSO_TOKEN */
export function resolveSsoCredentialsFromRequest(
  headers: Headers,
): SsoCredentials | null {
  const fromRequest = extractSsoCredentials(headers);
  if (fromRequest) {
    return fromRequest;
  }

  const cookieHeader = headers.get("cookie");
  if (cookieHeader) {
    const legacyToken = parseCookieValue(cookieHeader, DFC_SSO_SESSION_COOKIE_LEGACY);
    if (legacyToken) {
      return {
        token: legacyToken,
        tokenHeader: "Souche-Security-Token",
        cookieHeader: `${DFC_SSO_SESSION_COOKIE}=${legacyToken}`,
      };
    }
  }

  return getDevSsoCredentials();
}

export type DfcUserProfile = {
  userId?: string;
  userName?: string;
  shopCode?: string;
  shopName?: string;
  groupCode?: string;
  orgCode?: string;
  departmentCode?: string;
  phone?: string;
  linked: boolean;
  source?: "matador" | "sso" | "session" | "dev";
};

type MatadorResult<T> = {
  success?: boolean;
  data?: T;
  code?: string;
  msg?: string;
};

function cacheKey(sso: SsoCredentials) {
  return hashSsoToken(sso.token);
}

export function getCachedDfcUserProfile(
  sso: SsoCredentials | null | undefined,
): DfcUserProfile | null {
  if (!sso?.token) {
    return null;
  }
  const entry = profileCache.get(cacheKey(sso));
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    profileCache.delete(cacheKey(sso));
    return null;
  }
  return entry.profile;
}

export function rememberDfcUserProfile(
  sso: SsoCredentials,
  profile: DfcUserProfile,
) {
  profileCache.set(cacheKey(sso), {
    profile,
    expiresAt: Date.now() + PROFILE_TTL_MS,
  });
}

export function forgetDfcUserProfile(sso: SsoCredentials | null | undefined) {
  if (!sso?.token) {
    return;
  }
  profileCache.delete(cacheKey(sso));
}

/** 测试用 */
export function clearDfcUserProfileCacheForTest() {
  profileCache.clear();
}

function pickString(source: unknown, keys: string[]): string | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function pickShopFields(data: Record<string, unknown>): Partial<DfcUserProfile> {
  const nested = data.currentShop ?? data.shop ?? data.loginShop;
  return {
    shopCode:
      pickString(data, [
        "shopCode",
        "shop_code",
        "loginShopCode",
        "currentShopCode",
      ]) ?? pickString(nested, ["code", "shopCode", "shop_code"]),
    shopName:
      pickString(data, ["shopName", "shop_name", "loginShopName"]) ??
      pickString(nested, ["name", "shopName", "shop_name"]),
    groupCode:
      pickString(data, [
        "groupCode",
        "group_code",
        "loginGroupCode",
        "groupShopCode",
      ]) ?? pickString(nested, ["groupCode", "group_code", "orgCode"]),
    orgCode: pickString(data, ["orgCode", "org_code", "companyCode"]),
    departmentCode: pickString(data, [
      "departmentCode",
      "department_code",
      "deptCode",
    ]),
  };
}

function mergeProfile(
  ...parts: Array<Partial<DfcUserProfile> | null | undefined>
): DfcUserProfile {
  const merged: DfcUserProfile = { linked: false };
  for (const part of parts) {
    if (!part) continue;
    merged.userId = merged.userId || part.userId;
    merged.userName = merged.userName || part.userName;
    merged.phone = merged.phone || part.phone;
    merged.shopCode = merged.shopCode || part.shopCode;
    merged.shopName = merged.shopName || part.shopName;
    merged.groupCode = merged.groupCode || part.groupCode;
    merged.orgCode = merged.orgCode || part.orgCode;
    merged.departmentCode = merged.departmentCode || part.departmentCode;
    merged.source = merged.source || part.source;
  }
  merged.linked = Boolean(
    merged.userName || merged.userId || merged.shopCode || merged.phone,
  );
  return merged;
}

function resolveMatadorBaseUrl() {
  return (
    process.env.DFC_API_MATADOR_BASE_URL?.trim() ||
    "https://matador.dasouche.net"
  ).replace(/\/$/, "");
}

function resolveSsoUserInfoUrl() {
  return (
    process.env.DFC_SSO_USER_INFO_URL?.trim() ||
    "https://sso.dasouche.net/api/user/query/findUserInfoByToken.json"
  );
}

function buildSsoHeaders(sso: SsoCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  headers[sso.tokenHeader] = sso.token;
  if (sso.cookieHeader) {
    headers.Cookie = sso.cookieHeader;
  }
  return headers;
}

async function fetchMatadorLoginUser(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile> | null> {
  const url = `${resolveMatadorBaseUrl()}/api/web/workbench/common/commonApi/queryLoginUserInfo`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: buildSsoHeaders(sso),
      signal: controller.signal,
    });
    const payload = (await response.json()) as MatadorResult<
      Record<string, unknown>
    >;

    if (!response.ok || !payload.success || !payload.data) {
      return null;
    }

    const data = payload.data;
    return {
      userId: pickString(data, ["loginUserId", "userId", "account", "id"]),
      userName: pickString(data, [
        "loginUserName",
        "userName",
        "name",
        "nickname",
      ]),
      phone: pickString(data, [
        "loginUserPhone",
        "phone",
        "mobile",
        "loginPhone",
      ]),
      ...pickShopFields(data),
      source: "matador",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSsoTokenUser(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile> | null> {
  const url = resolveSsoUserInfoUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const body = new URLSearchParams({ token: sso.token });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    const payload = (await response.json()) as {
      success?: boolean;
      code?: string;
      data?: Record<string, unknown>;
    };

    if (!response.ok || payload.success === false || !payload.data) {
      return null;
    }

    const data = payload.data;
    return {
      userId: pickString(data, ["account", "userId", "login"]),
      userName: pickString(data, ["nickname", "userName", "name", "account"]),
      phone: pickString(data, ["phone", "mobile"]),
      ...pickShopFields(data),
      source: "sso",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMatadorDfcName(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile> | null> {
  const url = `${resolveMatadorBaseUrl()}/api/h5/user/userInfoApi/nameAndPhone`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        ...buildSsoHeaders(sso),
        "x-channel": "dfc",
      },
      signal: controller.signal,
    });
    const payload = (await response.json()) as MatadorResult<{
      name?: string;
      phone?: string;
    }>;

    if (!response.ok || !payload.success || !payload.data) {
      return null;
    }

    return {
      userName: payload.data.name,
      phone: payload.data.phone,
      source: "matador",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveDfcUserProfileFromSso(
  sso: SsoCredentials,
  options?: { refresh?: boolean },
): Promise<DfcUserProfile | null> {
  if (!options?.refresh) {
    const cached = getCachedDfcUserProfile(sso);
    if (cached) {
      return cached;
    }
  }

  const [workbenchUser, ssoUser, dfcName] = await Promise.all([
    fetchMatadorLoginUser(sso),
    fetchSsoTokenUser(sso),
    fetchMatadorDfcName(sso),
  ]);

  const merged = mergeProfile(workbenchUser, ssoUser, dfcName);
  if (!merged.linked) {
    forgetDfcUserProfile(sso);
    return null;
  }

  rememberDfcUserProfile(sso, merged);
  return merged;
}

export async function resolveDfcUserProfile(
  headers: Headers,
  options?: { refresh?: boolean },
): Promise<DfcUserProfile | null> {
  const sso = resolveSsoCredentialsFromRequest(headers);
  if (!sso) {
    return null;
  }
  return resolveDfcUserProfileFromSso(sso, options);
}

const USER_QUERY_ALIASES: Record<string, keyof DfcUserProfile> = {
  shopcode: "shopCode",
  shop_code: "shopCode",
  shopname: "shopName",
  shop_name: "shopName",
  groupcode: "groupCode",
  group_code: "groupCode",
  orgcode: "orgCode",
  org_code: "orgCode",
  departmentcode: "departmentCode",
  department_code: "departmentCode",
  phone: "phone",
  mobile: "phone",
  userid: "userId",
  user_id: "userId",
};

const SCOPE_QUERY_KEYS: Array<[string, keyof DfcUserProfile]> = [
  ["shopCode", "shopCode"],
  ["groupCode", "groupCode"],
  ["orgCode", "orgCode"],
  ["departmentCode", "departmentCode"],
];

function fillEmptyAliasValue(
  key: string,
  value: unknown,
  user: DfcUserProfile,
): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return undefined;
  }
  if (value != null && typeof value !== "string") {
    return undefined;
  }
  const field = USER_QUERY_ALIASES[key.toLowerCase()];
  const filled = field ? user[field] : undefined;
  return typeof filled === "string" && filled.trim() ? filled : undefined;
}

export function applyLoggedInUserToApiParams<
  T extends {
    phone?: string;
    shopCode?: string;
    groupCode?: string;
    orgCode?: string;
    departmentCode?: string;
  },
>(params: T, user: DfcUserProfile | null | undefined): T {
  if (!user?.linked) {
    return params;
  }
  return {
    ...params,
    shopCode: params.shopCode || user.shopCode,
    groupCode: params.groupCode || user.groupCode,
    orgCode: params.orgCode || user.orgCode,
    departmentCode: params.departmentCode || user.departmentCode,
  };
}

export function applyLoggedInUserToQuery(
  query: Record<string, string> | undefined,
  user: DfcUserProfile | null | undefined,
): Record<string, string> | undefined {
  if (!user?.linked) {
    return query;
  }
  const next = { ...(query ?? {}) };
  for (const [key, value] of Object.entries(next)) {
    const filled = fillEmptyAliasValue(key, value, user);
    if (filled) {
      next[key] = filled;
    }
  }
  for (const [key, field] of SCOPE_QUERY_KEYS) {
    if (next[key]?.trim()) {
      continue;
    }
    const filled = user[field];
    if (typeof filled === "string" && filled.trim()) {
      next[key] = filled;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

export function applyLoggedInUserToBody(
  body: Record<string, unknown> | undefined,
  user: DfcUserProfile | null | undefined,
): Record<string, unknown> | undefined {
  if (!user?.linked || !body) {
    return body;
  }
  const next = { ...body };
  for (const [key, value] of Object.entries(next)) {
    const filled = fillEmptyAliasValue(key, value, user);
    if (filled) {
      next[key] = filled;
    }
  }
  for (const [key, field] of SCOPE_QUERY_KEYS) {
    if (next[key] != null && String(next[key]).trim()) {
      continue;
    }
    const filled = user[field];
    if (typeof filled === "string" && filled.trim()) {
      next[key] = filled;
    }
  }
  return next;
}

export function formatDfcUserForPrompt(
  user: DfcUserProfile | null | undefined = getCachedDfcUserProfile(
    getSsoRequestContext(),
  ),
): string {
  if (!user?.linked) {
    return "当前未加载大风车登录用户资料。请先在侧栏同步 SSO Token；门店/集团由登录态自动注入，禁止向用户索取。";
  }

  const parts = [
    user.userName ? `姓名 ${user.userName}` : "",
    user.userId ? `账号 ${user.userId}` : "",
    user.phone ? `手机 ${user.phone}` : "",
    user.shopName || user.shopCode
      ? `门店 ${user.shopName ?? user.shopCode}${user.shopCode && user.shopName ? `（${user.shopCode}）` : ""}`
      : "",
    user.groupCode ? `集团 ${user.groupCode}` : "",
    user.orgCode ? `组织 ${user.orgCode}` : "",
    user.departmentCode ? `部门 ${user.departmentCode}` : "",
  ].filter(Boolean);

  return `当前登录用户：${parts.join("，") || "已关联大风车账号"}。调用 HTTP 时自动注入 shopCode/groupCode（及 orgCode/departmentCode）。禁止向用户索取门店/集团。问题里的客户手机号优先；仅当接口明确需要本人手机号且问题未给出号码时，才使用登录用户手机号。`;
}

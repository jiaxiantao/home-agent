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

export type DfcUpstreamName =
  | "queryLoginUserInfo"
  | "findUserInfoByToken"
  | "nameAndPhone";

export type DfcUpstreamCall = {
  url: string;
  status?: number;
  ok: boolean;
  payload: unknown;
};

export type DfcUserProfile = {
  userId?: string;
  userName?: string;
  account?: string;
  shopCode?: string;
  shopName?: string;
  groupCode?: string;
  groupId?: string;
  orgCode?: string;
  orgId?: string;
  departmentCode?: string;
  departmentId?: string;
  departmentName?: string;
  phone?: string;
  email?: string;
  linked: boolean;
  source?: "matador" | "sso" | "session" | "dev";
  /** 上游 data 浅合并，保留原始字段名 */
  data?: Record<string, unknown>;
  /** 各上游接口完整 JSON（含 success / code / msg） */
  raw?: Partial<Record<DfcUpstreamName, DfcUpstreamCall>>;
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

function pickDeepString(
  source: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  const direct = pickString(source, keys);
  if (direct) {
    return direct;
  }
  if (!source || typeof source !== "object" || Array.isArray(source) || depth >= 4) {
    return undefined;
  }
  for (const value of Object.values(source as Record<string, unknown>)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = pickDeepString(value, keys, depth + 1);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function unwrapData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.success === false) {
    return null;
  }
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (
    record.account ||
    record.userId ||
    record.loginUserId ||
    record.shopCode ||
    record.phone ||
    record.loginUserPhone
  ) {
    return record;
  }
  return null;
}

function extractConvenienceFields(
  data: Record<string, unknown>,
  source: DfcUserProfile["source"],
): Partial<DfcUserProfile> {
  return {
    userId: pickDeepString(data, [
      "loginUserId",
      "userId",
      "account",
      "id",
    ]),
    userName: pickDeepString(data, [
      "loginUserName",
      "displayName",
      "nickname",
      "userName",
      "name",
    ]),
    account: pickDeepString(data, ["account", "login"]),
    phone: pickDeepString(data, [
      "loginUserPhone",
      "phone",
      "mobile",
      "loginPhone",
    ]),
    email: pickDeepString(data, ["email", "mail"]),
    shopCode:
      pickDeepString(data, [
        "shopCode",
        "shop_code",
        "loginShopCode",
        "currentShopCode",
      ]) ??
      pickString(data.currentShop ?? data.shop ?? data.loginShop, [
        "code",
        "shopCode",
        "shop_code",
      ]),
    shopName:
      pickDeepString(data, ["shopName", "shop_name", "loginShopName"]) ??
      pickString(data.currentShop ?? data.shop ?? data.loginShop, [
        "name",
        "shopName",
        "shop_name",
      ]),
    groupCode: pickDeepString(data, [
      "groupCode",
      "group_code",
      "loginGroupCode",
      "groupShopCode",
    ]),
    groupId: pickDeepString(data, ["groupId", "group_id"]),
    orgCode: pickDeepString(data, ["orgCode", "org_code", "companyCode"]),
    orgId: pickDeepString(data, ["orgId", "org_id"]),
    departmentCode: pickDeepString(data, [
      "departmentCode",
      "department_code",
      "deptCode",
    ]),
    departmentId: pickDeepString(data, ["departmentId", "department_id", "deptId"]),
    departmentName: pickDeepString(data, [
      "departmentName",
      "department_name",
      "deptName",
    ]),
    source,
  };
}

function mergeData(
  ...parts: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part)) {
      if (merged[key] === undefined && value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function mergeProfile(
  ...parts: Array<Partial<DfcUserProfile> | null | undefined>
): DfcUserProfile {
  const merged: DfcUserProfile = { linked: false, data: {}, raw: {} };
  for (const part of parts) {
    if (!part) continue;
    merged.userId = merged.userId || part.userId;
    merged.userName = merged.userName || part.userName;
    merged.account = merged.account || part.account;
    merged.phone = merged.phone || part.phone;
    merged.email = merged.email || part.email;
    merged.shopCode = merged.shopCode || part.shopCode;
    merged.shopName = merged.shopName || part.shopName;
    merged.groupCode = merged.groupCode || part.groupCode;
    merged.groupId = merged.groupId || part.groupId;
    merged.orgCode = merged.orgCode || part.orgCode;
    merged.orgId = merged.orgId || part.orgId;
    merged.departmentCode = merged.departmentCode || part.departmentCode;
    merged.departmentId = merged.departmentId || part.departmentId;
    merged.departmentName = merged.departmentName || part.departmentName;
    merged.source = merged.source || part.source;
    merged.data = mergeData(merged.data, part.data);
    merged.raw = { ...merged.raw, ...part.raw };
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

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<DfcUpstreamCall> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { parseError: true, body: text.slice(0, 2000) };
    }
    return { url, status: response.status, ok: response.ok, payload };
  } catch (error) {
    return {
      url,
      ok: false,
      payload: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function fromUpstream(
  name: DfcUpstreamName,
  call: DfcUpstreamCall,
  source: DfcUserProfile["source"],
): Partial<DfcUserProfile> {
  const data = unwrapData(call.payload);
  return {
    ...(data ? extractConvenienceFields(data, source) : { source }),
    data: data ?? {},
    raw: { [name]: call },
  };
}

async function fetchMatadorLoginUser(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile>> {
  const url = `${resolveMatadorBaseUrl()}/api/web/workbench/common/commonApi/queryLoginUserInfo`;
  const call = await fetchJson(url, { headers: buildSsoHeaders(sso) });
  return fromUpstream("queryLoginUserInfo", call, "matador");
}

async function fetchSsoTokenUser(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile>> {
  const url = resolveSsoUserInfoUrl();
  const body = new URLSearchParams({ token: sso.token });
  const call = await fetchJson(url, {
    method: "POST",
    headers: {
      ...buildSsoHeaders(sso),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return fromUpstream("findUserInfoByToken", call, "sso");
}

async function fetchMatadorDfcName(
  sso: SsoCredentials,
): Promise<Partial<DfcUserProfile>> {
  const url = `${resolveMatadorBaseUrl()}/api/h5/user/userInfoApi/nameAndPhone`;
  const call = await fetchJson(url, {
    headers: {
      ...buildSsoHeaders(sso),
      "x-channel": "dfc",
    },
  });
  return fromUpstream("nameAndPhone", call, "matador");
}

export async function resolveDfcUserProfileFromSso(
  sso: SsoCredentials,
  options?: { refresh?: boolean },
): Promise<DfcUserProfile | null> {
  if (!options?.refresh) {
    const cached = getCachedDfcUserProfile(sso);
    if (cached?.raw && Object.keys(cached.raw).length > 0) {
      return cached;
    }
  }

  const [workbenchUser, ssoUser, dfcName] = await Promise.all([
    fetchMatadorLoginUser(sso),
    fetchSsoTokenUser(sso),
    fetchMatadorDfcName(sso),
  ]);

  const merged = mergeProfile(workbenchUser, ssoUser, dfcName);
  if (merged.linked) {
    rememberDfcUserProfile(sso, merged);
  } else {
    forgetDfcUserProfile(sso);
  }
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
    user.account ? `账号 ${user.account}` : user.userId ? `账号 ${user.userId}` : "",
    user.phone ? `手机 ${user.phone}` : "",
    user.email ? `邮箱 ${user.email}` : "",
    user.shopName || user.shopCode
      ? `门店 ${user.shopName ?? user.shopCode}${user.shopCode && user.shopName ? `（${user.shopCode}）` : ""}`
      : "",
    user.groupCode || user.groupId
      ? `集团 ${user.groupCode ?? user.groupId}`
      : "",
    user.orgCode || user.orgId ? `组织 ${user.orgCode ?? user.orgId}` : "",
    user.departmentName || user.departmentCode || user.departmentId
      ? `部门 ${user.departmentName ?? user.departmentCode ?? user.departmentId}`
      : "",
  ].filter(Boolean);

  return `当前登录用户：${parts.join("，") || "已关联大风车账号"}。调用 HTTP 时自动注入 shopCode/groupCode（及 orgCode/departmentCode）。禁止向用户索取门店/集团。问题里的客户手机号优先；仅当接口明确需要本人手机号且问题未给出号码时，才使用登录用户手机号。`;
}

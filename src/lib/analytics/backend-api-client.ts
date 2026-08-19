import type { ApiRouteParams, DfcApiEndpoint } from "@/lib/analytics/api-catalog";
import {
  alternateTestRequestUrls,
  resolveDirectHttpPathForApp,
  inferDefaultBaseUrlForApp,
  shouldSkipHttpProbe,
} from "@/lib/analytics/dfc-api-test-hosts";
import { httpMethodAllowsBody } from "@/lib/analytics/http-methods";
import { getDevSsoCredentials, getSsoCookieNames } from "@/lib/security/sso-config";
import { getSsoRequestContext } from "@/lib/security/sso-context";

export { inferDefaultBaseUrlForApp };

export type BackendApiFailureKind =
  | "missing_params"
  | "not_configured"
  | "network"
  | "http"
  | "timeout"
  | "auth"
  | "skipped";

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return name === "AbortError" || /aborted/i.test(message);
}

export type BackendApiCallResult = {
  status: "success" | "not_configured" | "skipped" | "error";
  endpointId: string;
  appCode: string;
  request?: {
    method: string;
    url: string;
    query?: Record<string, string>;
    body?: unknown;
    headers?: Record<string, string>;
  };
  httpStatus?: number;
  responseHeaders?: Record<string, string>;
  response?: unknown;
  /** 归一化为表格，便于与 SQL 结果一致展示 */
  table?: { columns: string[]; rows: Record<string, unknown>[] };
  message: string;
  failureKind?: BackendApiFailureKind;
  /** HTTP 失败时给出可直接 propose_sql 的完整 SQL，避免向用户索参 */
  suggestedSql?: string;
  sqlFallback?: {
    database: string;
    table: string;
    hint: string;
  };
  /** Agent 下一步动作（结构化，供 planner / 规则回退） */
  nextAction?: string;
  callHints?: string[];
  envConfigured?: boolean;
  endpointTitle?: string;
  remainingEndpointIds?: string[];
};

function isApiEnabled() {
  const flag = process.env.DFC_API_ENABLED?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function inferredAppBaseUrlEnvKey(appCode: string) {
  return `DFC_API_${appCode.trim().replace(/-/g, "_").toUpperCase()}_BASE_URL`;
}

function envBaseUrl(key: string | undefined): string | undefined {
  if (!key) {
    return undefined;
  }
  const value = process.env[key]?.trim();
  return value ? value.replace(/\/$/, "") : undefined;
}

/** 解析上游 baseUrl：登记 env key → 按 appCode 推断的 DFC_API_*_BASE_URL → 网关兜底 */
export function resolveDfcApiEndpointBaseUrl(
  endpoint: Pick<DfcApiEndpoint, "appCode" | "baseUrlEnvKey">,
): string | undefined {
  const inferred = inferredAppBaseUrlEnvKey(endpoint.appCode);
  const fromKeys = [
    envBaseUrl(endpoint.baseUrlEnvKey),
    endpoint.baseUrlEnvKey === inferred ? undefined : envBaseUrl(inferred),
  ];
  for (const value of fromKeys) {
    if (value) {
      return value;
    }
  }
  const generic = envBaseUrl("DFC_API_GATEWAY_BASE_URL");
  if (generic) {
    return `${generic}/${endpoint.appCode}`;
  }
  return undefined;
}

function resolveBaseUrl(endpoint: DfcApiEndpoint): string | undefined {
  return resolveDfcApiEndpointBaseUrl(endpoint);
}

export function formatNotConfiguredBaseUrlMessage(baseUrlEnvKey: string): string {
  if (baseUrlEnvKey === "DFC_API_GATEWAY_BASE_URL") {
    return "未配置 DFC_API_GATEWAY_BASE_URL（或在 config/dfc-app-registry.json 为该 app 配置独立 DFC_API_*_BASE_URL）";
  }
  return `未配置 ${baseUrlEnvKey}（亦未配置 DFC_API_GATEWAY_BASE_URL 作为兜底）`;
}

export function isDfcApiEndpointEnvConfigured(
  endpoint: Pick<DfcApiEndpoint, "appCode" | "baseUrlEnvKey">,
): boolean {
  return Boolean(resolveDfcApiEndpointBaseUrl(endpoint));
}

function currentApiEnv() {
  return (
    process.env.ANALYTICS_MYSQL_ENV?.trim() ||
    process.env.DFC_API_ENV?.trim() ||
    "test"
  ).toLowerCase();
}

/** 测试环境禁止打线上 *.souche.com / *.souche-inc.com */
export function assertTestSafeUpstreamUrl(url: string): string | undefined {
  if (currentApiEnv() !== "test") {
    return undefined;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return `无效上游地址：${url}`;
  }

  if (/(^|\.)souche\.com$/i.test(hostname) || /(^|\.)souche-inc\.com$/i.test(hostname)) {
    return `测试环境禁止调用线上域名 ${hostname}，请改用 *.dasouche.net（当前 ANALYTICS_MYSQL_ENV=${currentApiEnv()}）`;
  }

  return undefined;
}

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

/** 根据接口回退表 + 已知参数，生成可直接执行的只读 SQL */
export function buildSuggestedSqlForEndpoint(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
): string | undefined {
  const fallback = endpoint.sqlFallback;
  if (!fallback || fallback.database === "*") {
    return undefined;
  }

  const db = fallback.database;
  const table = fallback.table;
  const httpPath = endpoint.http?.path ?? "";

  if (
    table === "*" &&
    (endpoint.appCode === "danube-megatron" || endpoint.appCode === "megatron")
  ) {
    if (/\/user\b|cheniu_user/i.test(`${httpPath} ${endpoint.entity}`)) {
      if (params.phone) {
        return `SELECT user_id, dfc_user_id, name, phone, area, is_auth, date_create FROM \`matador\`.\`cheniu_user\` WHERE phone = '${escapeSqlLiteral(params.phone)}' AND date_delete IS NULL LIMIT 20`;
      }
      if (params.recordId) {
        const id = escapeSqlLiteral(params.recordId);
        return `SELECT user_id, dfc_user_id, name, phone, area, is_auth, date_create FROM \`matador\`.\`cheniu_user\` WHERE (user_id = '${id}' OR dfc_user_id = '${id}') AND date_delete IS NULL LIMIT 20`;
      }
      return `SELECT user_id, dfc_user_id, name, phone, area, is_auth, date_create FROM \`matador\`.\`cheniu_user\` WHERE date_delete IS NULL LIMIT 20`;
    }
    return undefined;
  }

  if (table === "*" && endpoint.appCode === "crazyracing-kartrider") {
    if (/car|grossprofit|plate|vin|carviewquery|cardetail/i.test(`${httpPath} ${endpoint.entity}`)) {
      if (params.plate) {
        const plate = escapeSqlLiteral(params.plate);
        return `SELECT id, JSON_UNQUOTE(JSON_EXTRACT(name, '$.displayValue')) AS car_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.brandName')) AS brand_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.seriesName')) AS series_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.modelName')) AS model_name, plate_number, vin_number, mileage, JSON_UNQUOTE(JSON_EXTRACT(area, '$.displayValue')) AS area, sale_price, shop_code, date_create FROM \`crazy_kartrider\`.\`car\` WHERE plate_number = '${plate}' AND date_delete = 0 LIMIT 20`;
      }
      if (params.recordId) {
        const id = escapeSqlLiteral(params.recordId);
        return `SELECT id, JSON_UNQUOTE(JSON_EXTRACT(name, '$.displayValue')) AS car_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.brandName')) AS brand_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.seriesName')) AS series_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.modelName')) AS model_name, plate_number, vin_number, mileage, JSON_UNQUOTE(JSON_EXTRACT(area, '$.displayValue')) AS area, sale_price, shop_code, date_create FROM \`crazy_kartrider\`.\`car\` WHERE id = '${id}' AND date_delete = 0 LIMIT 20`;
      }
      return `SELECT id, plate_number, vin_number, sale_price, shop_code, date_create FROM \`crazy_kartrider\`.\`car\` WHERE date_delete = 0 LIMIT 20`;
    }
    return undefined;
  }

  if (table === "*" && endpoint.appCode === "danube-authorization") {
    if (/open\/user|getByCode|getByToken|getRolesByCode|getUserRoleByCode/i.test(httpPath)) {
      if (params.phone) {
        return `SELECT user_id, dfc_user_id, name, phone, area, is_auth, date_create FROM \`matador\`.\`cheniu_user\` WHERE phone = '${escapeSqlLiteral(params.phone)}' AND date_delete IS NULL LIMIT 20`;
      }
      if (params.recordId) {
        const id = escapeSqlLiteral(params.recordId);
        return `SELECT user_id, dfc_user_id, name, phone, area, is_auth, date_create FROM \`matador\`.\`cheniu_user\` WHERE (user_id = '${id}' OR dfc_user_id = '${id}') AND date_delete IS NULL LIMIT 20`;
      }
      return `SELECT user_id, dfc_user_id, name, phone, area, is_auth, date_create FROM \`matador\`.\`cheniu_user\` WHERE date_delete IS NULL LIMIT 20`;
    }
    if (/open\/shop|listOrgByIds|listShopByCodes/i.test(httpPath)) {
      if (params.shopCode) {
        return `SELECT id, name, shop_code, org_id, date_create FROM \`matador\`.\`organization\` WHERE shop_code = '${escapeSqlLiteral(params.shopCode)}' LIMIT 20`;
      }
      if (params.recordId) {
        const id = escapeSqlLiteral(params.recordId);
        return `SELECT id, name, shop_code, org_id, date_create FROM \`matador\`.\`organization\` WHERE id = '${id}' LIMIT 20`;
      }
      return `SELECT id, name, shop_code, org_id, date_create FROM \`matador\`.\`organization\` LIMIT 20`;
    }
    if (/auth|role|user/i.test(endpoint.entity)) {
      return `SELECT user_id, dfc_user_id, name, phone FROM \`matador\`.\`cheniu_user\` WHERE date_delete IS NULL LIMIT 20`;
    }
    return undefined;
  }

  if (table === "*") {
    return undefined;
  }

  if (params.recordId && /customer/i.test(table)) {
    return `SELECT id, name, phone, shop_code, owner, grade, source, date_create, date_update FROM \`${db}\`.\`${table}\` WHERE id = '${escapeSqlLiteral(params.recordId)}' LIMIT 20`;
  }

  if ((params.phone || params.wechat) && /customer/i.test(table)) {
    const contact = escapeSqlLiteral(params.phone || params.wechat || "");
    return `SELECT id, name, phone, weichat, shop_code, owner, grade, source, date_create, date_update FROM \`${db}\`.\`${table}\` WHERE phone = '${contact}' OR phone_backup = '${contact}' OR weichat = '${contact}' LIMIT 20`;
  }

  if (params.phone && /cheniu_user/i.test(table)) {
    return `SELECT user_id, dfc_user_id, name, phone, area, address, is_auth, app_source, date_create FROM \`${db}\`.\`${table}\` WHERE phone = '${escapeSqlLiteral(params.phone)}' AND date_delete IS NULL LIMIT 20`;
  }

  if (params.recordId && /cheniu_user/i.test(table)) {
    const id = escapeSqlLiteral(params.recordId);
    return `SELECT user_id, dfc_user_id, name, phone, area, address, is_auth, app_source, date_create FROM \`${db}\`.\`${table}\` WHERE (user_id = '${id}' OR dfc_user_id = '${id}') AND date_delete IS NULL LIMIT 20`;
  }

  if (params.plate) {
    const plate = escapeSqlLiteral(params.plate);
    if (db === "crazy_kartrider" || /kartrider/i.test(table)) {
      return `SELECT id, JSON_UNQUOTE(JSON_EXTRACT(name, '$.displayValue')) AS car_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.brandName')) AS brand_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.seriesName')) AS series_name, JSON_UNQUOTE(JSON_EXTRACT(name, '$.modelName')) AS model_name, plate_number, vin_number, mileage, JSON_UNQUOTE(JSON_EXTRACT(area, '$.displayValue')) AS area, sale_price, shop_code, date_create FROM \`crazy_kartrider\`.\`car\` WHERE plate_number = '${plate}' AND date_delete = 0 LIMIT 20`;
    }
    return `SELECT car_id, brand_name, series_name, model_name, license_number, vin, sale_price, car_status, date_create FROM \`${db}\`.\`${table}\` WHERE license_number = '${plate}' LIMIT 20`;
  }

  if (params.recordId && /id\s*=\s*\?/i.test(fallback.hint)) {
    return `SELECT * FROM \`${db}\`.\`${table}\` WHERE id = '${escapeSqlLiteral(params.recordId)}' LIMIT 20`;
  }

  if ((params.phone || params.wechat) && /phone\s*=\s*\?/i.test(fallback.hint)) {
    const contact = escapeSqlLiteral(params.phone || params.wechat || "");
    return `SELECT * FROM \`${db}\`.\`${table}\` WHERE phone = '${contact}' LIMIT 20`;
  }

  return undefined;
}

function isNetworkFailure(status: number, bodyText: string) {
  if ([502, 503, 504].includes(status)) return true;
  return /upstream connect error|connection (?:refused|reset|failure)|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(
    bodyText,
  );
}

function looksLikeHtmlLoginPage(text: string) {
  return /<!DOCTYPE html|<html[\s>]|sso\.(?:souche\.com|dasouche\.net)\/login|login\.htm/i.test(
    text,
  );
}

function isAuthRedirect(status: number, location: string | null) {
  if (![301, 302, 303, 307, 308].includes(status)) return false;
  if (!location) return true;
  return /sso\.(?:souche\.com|dasouche\.net)|login\.htm|\/login/i.test(location);
}

function needsWebSourceCode(appCode: string) {
  return /^(super-mario|danube-chord|chord|rich-man|glorious-mission|crazyracing-kartrider|danube-chaos|chaos)$/i.test(
    appCode,
  );
}

/** 组装上游 HTTP SSO 头（单次写入，避免 undici 合并重复头） */
export function buildDfcUpstreamSsoHeaders(sso: {
  token: string;
  tokenHeader: string;
  cookieHeader?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  applySsoHeaders(headers, sso);
  return headers;
}

function applySsoHeaders(
  headers: Record<string, string>,
  sso: { token: string; tokenHeader: string; cookieHeader?: string },
) {
  // Node undici 会把大小写不同的同名头合并成 "a, a"；双写会导致 CRM 10001。
  // 只写一次标准头即可（Mars / H5 均识别 Souche-Security-Token）。
  const headerName = sso.tokenHeader?.trim() || "Souche-Security-Token";
  headers[headerName] = sso.token;
  headers.Cookie =
    sso.cookieHeader?.trim() || `_security_token=${sso.token}`;
}

function isBusinessAuthFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const code = record.code ?? record.errorCode ?? record.errno;
  if (code == null) return false;
  const normalized = String(code);
  return (
    normalized === "10001" ||
    normalized === "401" ||
    normalized === "UNAUTHORIZED" ||
    /登录超时|未登录|请重新登录/i.test(String(record.msg ?? record.message ?? ""))
  );
}

/** Spring Boot 400：Required String parameter 'articleId' is not present */
export function parseSpringMissingParameterMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const message = String(record.message ?? record.error ?? "");
  const match = message.match(
    /Required (?:String|Integer|Long|Boolean|Double|Float|int|long) parameter '([^']+)' is not present/i,
  );
  if (!match) {
    return null;
  }
  return match[1] ?? null;
}

/** bot-wall WAF 拦截（同 token 下 ksMini/mini/ttMini 可达） */
export function isBotWallWafBlock(
  httpStatus: number,
  requestUrl: string,
  payload: unknown,
): boolean {
  if (httpStatus !== 403) {
    return false;
  }
  let pathname = requestUrl;
  try {
    pathname = new URL(requestUrl).pathname;
  } catch {
    // keep raw url
  }
  if (!/\/bot-wall\//i.test(pathname)) {
    return false;
  }
  if (!payload || typeof payload !== "object") {
    return true;
  }
  const record = payload as Record<string, unknown>;
  return record.success === false || record.code != null;
}

export type CallBackendApiOptions = {
  /** catalog 无 template 时的通用 query 透传 */
  extraQuery?: Record<string, string>;
  /** catalog 无 template 时的通用 JSON body 透传（仅 POST） */
  extraBody?: unknown;
  /** 覆盖 DFC_API_SERVICE_CHAIN（MCP 透传） */
  serviceChain?: string;
  /** 测试页额外请求头（覆盖 SSO 等默认值） */
  extraHeaders?: Record<string, string>;
  /** 测试页 Cookie（合并进 Cookie 头） */
  extraCookies?: Record<string, string>;
  /** 控制台接口测试允许调用非只读接口 */
  allowWrite?: boolean;
};

function mergeCookieHeader(
  headers: Record<string, string>,
  cookies?: Record<string, string>,
) {
  if (!cookies || !Object.keys(cookies).length) {
    return;
  }
  const parts = Object.entries(cookies)
    .filter(([key]) => key.trim())
    .map(([key, value]) => `${key.trim()}=${value}`);
  if (!parts.length) {
    return;
  }
  const extra = parts.join("; ");
  headers.Cookie = headers.Cookie?.trim()
    ? `${headers.Cookie.trim()}; ${extra}`
    : extra;
}

export function buildBackendApiHeaders(
  endpoint: DfcApiEndpoint,
  options?: Pick<
    CallBackendApiOptions,
    "serviceChain" | "extraHeaders" | "extraCookies"
  >,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const sso = getSsoRequestContext() ?? getDevSsoCredentials();
  if (sso) {
    applySsoHeaders(headers, sso);
  } else {
    const token = process.env.DFC_API_AUTH_TOKEN?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  if (needsWebSourceCode(endpoint.appCode)) {
    headers._source_code = "WEB";
  }

  const serviceChain =
    options?.serviceChain?.trim() || process.env.DFC_API_SERVICE_CHAIN?.trim();
  if (serviceChain) {
    headers["X-Souche-ServiceChain"] = serviceChain;
  }

  if (options?.extraHeaders) {
    for (const [key, value] of Object.entries(options.extraHeaders)) {
      if (key.trim()) {
        headers[key.trim()] = value;
      }
    }
  }

  mergeCookieHeader(headers, options?.extraCookies);

  return headers;
}

export function buildBackendApiRequest(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
  options?: CallBackendApiOptions,
): { method: string; url: string; query?: Record<string, string>; body?: unknown } | null {
  return buildRequest(endpoint, params, options);
}

export function previewBackendApiCall(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
  options?: CallBackendApiOptions,
) {
  const request = buildRequest(endpoint, params, options);
  if (!request) {
    return null;
  }
  const headers = buildBackendApiHeaders(endpoint, options);
  return {
    method: request.method,
    url: request.url,
    query: request.query,
    body: request.body,
    headers,
  };
}

/** 预览用：环境变量未配置时仍展示推断 URL（默认 https://{appCode}.stable.dasouche.net） */
export function previewBackendApiCallWithFallback(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
  options?: CallBackendApiOptions,
) {
  const configuredBase = resolveBaseUrl(endpoint);
  const previewBase =
    configuredBase ?? inferDefaultBaseUrlForApp(endpoint.appCode);
  const request = buildRequest(endpoint, params, options, previewBase);
  if (!request) {
    return null;
  }
  const headers = buildBackendApiHeaders(endpoint, options);
  return {
    method: request.method,
    url: request.url,
    query: request.query,
    body: request.body,
    headers,
    baseUrlConfigured: Boolean(configuredBase),
  };
}

function buildRequest(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
  options?: CallBackendApiOptions,
  baseOverride?: string,
): { url: string; method: string; query?: Record<string, string>; body?: unknown } | null {
  if (!endpoint.http) {
    return null;
  }

  const base = baseOverride ?? resolveBaseUrl(endpoint);
  if (!base) {
    return null;
  }

  const httpPath = resolveDirectHttpPathForApp(
    endpoint.appCode,
    endpoint.http.path,
    base,
  );
  const url = new URL(
    `${base}${httpPath.startsWith("/") ? "" : "/"}${httpPath}`,
  );
  const query: Record<string, string> = {};

  if (endpoint.http.queryParams) {
    for (const [queryKey, paramKey] of Object.entries(endpoint.http.queryParams)) {
      const value = params[paramKey as keyof ApiRouteParams];
      if (value) {
        url.searchParams.set(queryKey, String(value));
        query[queryKey] = String(value);
      }
    }
  }

  if (options?.extraQuery) {
    for (const [queryKey, value] of Object.entries(options.extraQuery)) {
      if (value == null || value === "") continue;
      url.searchParams.set(queryKey, String(value));
      query[queryKey] = String(value);
    }
  }

  let body: unknown;
  if (endpoint.http.bodyTemplate) {
    body = JSON.parse(
      JSON.stringify(endpoint.http.bodyTemplate).replace(
        /\{\{(\w+)\}\}/g,
        (_, key: string) => String(params[key as keyof ApiRouteParams] ?? ""),
      ),
    );
  } else if (options?.extraBody && httpMethodAllowsBody(endpoint.http.method)) {
    body = options.extraBody;
  }

  return {
    url: url.toString(),
    method: endpoint.http.method,
    query: Object.keys(query).length ? query : undefined,
    body: httpMethodAllowsBody(endpoint.http.method) ? body : undefined,
  };
}

function flattenForTable(value: unknown, prefix = ""): Record<string, unknown> {
  if (value === null || value === undefined) {
    return prefix ? { [prefix]: value } : {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return prefix ? { [prefix]: value } : { value };
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
      Object.assign(out, flattenForTable(nested, nextKey));
    } else {
      out[nextKey] = nested;
    }
  }
  return out;
}

function normalizeResponse(payload: unknown): { columns: string[]; rows: Record<string, unknown>[] } {
  let data = payload;
  if (data && typeof data === "object" && "data" in (data as Record<string, unknown>)) {
    data = (data as Record<string, unknown>).data;
  }

  if (Array.isArray(data)) {
    const rows = data.map((item) => flattenForTable(item));
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return { columns, rows };
  }

  const row = flattenForTable(data);
  const columns = Object.keys(row);
  return { columns, rows: columns.length ? [row] : [] };
}

function withSqlFallback(
  result: Omit<BackendApiCallResult, "suggestedSql">,
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
): BackendApiCallResult {
  return {
    ...result,
    suggestedSql: buildSuggestedSqlForEndpoint(endpoint, params),
  };
}

function collectResponseHeaders(response: Response) {
  const out: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function hasSecurityTokenInCookies(cookies?: Record<string, string>) {
  if (!cookies) {
    return false;
  }
  for (const name of getSsoCookieNames()) {
    if (cookies[name]?.trim()) {
      return true;
    }
  }
  return false;
}

function hasUpstreamAuth(options?: CallBackendApiOptions) {
  if (getSsoRequestContext() ?? getDevSsoCredentials()) {
    return true;
  }
  if (process.env.DFC_API_AUTH_TOKEN?.trim()) {
    return true;
  }
  if (hasSecurityTokenInCookies(options?.extraCookies)) {
    return true;
  }
  if (!options?.extraHeaders) {
    return false;
  }
  return Object.entries(options.extraHeaders).some(([key]) =>
    /authorization|cookie|token/i.test(key),
  );
}

export async function callBackendApi(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
  options?: CallBackendApiOptions,
): Promise<BackendApiCallResult> {
  const sqlFallback = endpoint.sqlFallback;

  if (!endpoint.http) {
    return withSqlFallback(
      {
        status: "skipped",
        failureKind: "skipped",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        message: `接口 ${endpoint.id} 缺少 HTTP 定义，无法调用。请直接 propose_sql 使用下方 suggestedSql / SQL 回退。`,
        sqlFallback,
      },
      endpoint,
      params,
    );
  }

  if (!endpoint.readOnly && !options?.allowWrite) {
    return withSqlFallback(
      {
        status: "skipped",
        failureKind: "skipped",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        message: "非只读接口，Agent 不自动调用。请改用 SQL。",
        sqlFallback,
      },
      endpoint,
      params,
    );
  }

  if (shouldSkipHttpProbe(endpoint.appCode)) {
    return withSqlFallback(
      {
        status: "skipped",
        failureKind: "network",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        message: `${endpoint.appCode} 测试集群无可用 HTTP 实例（网关 503），已跳过调用。请 propose_sql 使用 suggestedSql，勿改 default_test_config。`,
        sqlFallback,
      },
      endpoint,
      params,
    );
  }

  const request = buildRequest(endpoint, params, options);
  if (!request) {
    return withSqlFallback(
      {
        status: "not_configured",
        failureKind: "not_configured",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        message: `${formatNotConfiguredBaseUrlMessage(endpoint.baseUrlEnvKey)}。参数已齐全时请直接 propose_sql，勿向用户索取额外参数。`,
        sqlFallback,
      },
      endpoint,
      params,
    );
  }

  const blockedHost = assertTestSafeUpstreamUrl(request.url);
  if (blockedHost) {
    return withSqlFallback(
      {
        status: "error",
        failureKind: "not_configured",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          body: request.body,
        },
        message: `${blockedHost}。请直接 propose_sql 使用 suggestedSql。`,
        sqlFallback,
      },
      endpoint,
      params,
    );
  }

  if (!isApiEnabled()) {
    return withSqlFallback(
      {
        status: "not_configured",
        failureKind: "not_configured",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          body: request.body,
        },
        message:
          "DFC_API_ENABLED 未开启。接口参数已匹配；请直接 propose_sql 回退，勿向用户索取 shop_code 等额外参数。",
        sqlFallback,
      },
      endpoint,
      params,
    );
  }

  if (endpoint.http.queryParams) {
    const missing: string[] = [];
    for (const paramKey of Object.values(endpoint.http.queryParams)) {
      const value = params[paramKey as keyof ApiRouteParams];
      if (!value) {
        missing.push(String(paramKey));
      }
    }
    if (missing.length > 0) {
      return withSqlFallback(
        {
          status: "skipped",
          failureKind: "missing_params",
          endpointId: endpoint.id,
          appCode: endpoint.appCode,
          request: {
            method: request.method,
            url: request.url,
            query: request.query,
            body: request.body,
          },
          message: `接口 ${endpoint.methodName ?? endpoint.id} 缺少参数：${missing.join("、")}。若问题已含 recordId/手机号，请改用 SQL 回退；不要向用户索取 shop_code。`,
          sqlFallback,
        },
        endpoint,
        params,
      );
    }
  }

  if (endpoint.http.bodyTemplate) {
    const placeholders = [
      ...JSON.stringify(endpoint.http.bodyTemplate).matchAll(/\{\{(\w+)\}\}/g),
    ].map((match) => match[1]!);
    const missing = placeholders.filter(
      (key) => !params[key as keyof ApiRouteParams],
    );
    if (missing.length > 0) {
      return withSqlFallback(
        {
          status: "skipped",
          failureKind: "missing_params",
          endpointId: endpoint.id,
          appCode: endpoint.appCode,
          request: {
            method: request.method,
            url: request.url,
            query: request.query,
            body: request.body,
          },
          message: `接口 ${endpoint.methodName ?? endpoint.id} 缺少参数：${missing.join("、")}。请直接 propose_sql 回退。`,
          sqlFallback,
        },
        endpoint,
        params,
      );
    }
  }

  const headers = buildBackendApiHeaders(endpoint, options);

  if (!hasUpstreamAuth(options)) {
    return withSqlFallback(
      {
        status: "error",
        failureKind: "auth",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          body: request.body,
          headers,
        },
        message:
          "缺少大风车 SSO：请侧栏「同步大风车登录」，或在 .env 配置 DFC_API_DEV_SSO_TOKEN，或在测试 Cookies 中填写 _security_token。",
        sqlFallback,
      },
      endpoint,
      params,
    );
  }

  const timeoutMs = Number(process.env.DFC_API_TIMEOUT_MS ?? 12000);
  const candidateUrls = [
    request.url,
    ...alternateTestRequestUrls(request.url),
  ].filter((url) => !assertTestSafeUpstreamUrl(url));

  try {
    let response: Response | undefined;
    let text = "";
    let usedUrl = request.url;
    let lastError: unknown;

    for (let index = 0; index < candidateUrls.length; index += 1) {
      const candidateUrl = candidateUrls[index]!;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // 不自动跟随 SSO 登录页重定向，否则会误把 HTML 当成 200 成功
        response = await fetch(candidateUrl, {
          method: request.method,
          headers,
          body: request.body ? JSON.stringify(request.body) : undefined,
          signal: controller.signal,
          redirect: "manual",
        });
        text = await response.text();
        usedUrl = candidateUrl;
        const network = isNetworkFailure(response.status, text.slice(0, 240));
        if (!network || index === candidateUrls.length - 1) {
          break;
        }
      } catch (error) {
        lastError = error;
        usedUrl = candidateUrl;
        if (isAbortError(error) || index === candidateUrls.length - 1) {
          throw error;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    if (!response) {
      throw lastError instanceof Error ? lastError : new Error("上游无响应");
    }

    const responseHeaders = collectResponseHeaders(response);
    const httpStatus = response.status;
    const requestMeta = {
      method: request.method,
      url: usedUrl,
      query: request.query,
      body: request.body,
      headers,
    };

    const location = response.headers.get("location");
    if (isAuthRedirect(response.status, location)) {
      return withSqlFallback(
        {
          status: "error",
          failureKind: "auth",
          endpointId: endpoint.id,
          appCode: endpoint.appCode,
          request: requestMeta,
          httpStatus,
          responseHeaders,
          message:
            "大风车 HTTP 返回 SSO 登录跳转：当前 token 无效或未登录。请侧栏重新同步大风车登录 / 更新 DFC_API_DEV_SSO_TOKEN 后重试 MCP 调用。",
          sqlFallback,
        },
        endpoint,
        params,
      );
    }

    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // keep text
    }

    if (response.ok && typeof payload === "string" && looksLikeHtmlLoginPage(payload)) {
      return withSqlFallback(
        {
          status: "error",
          failureKind: "auth",
          endpointId: endpoint.id,
          appCode: endpoint.appCode,
          request: requestMeta,
          httpStatus,
          responseHeaders,
          response: payload,
          message:
            "大风车 HTTP 返回登录页 HTML（非 JSON）：SSO 未生效。请同步大风车登录后再经 MCP 调用。",
          sqlFallback,
        },
        endpoint,
        params,
      );
    }

    if (response.ok && isBusinessAuthFailure(payload)) {
      const msg =
        payload && typeof payload === "object"
          ? String(
              (payload as Record<string, unknown>).msg ??
                (payload as Record<string, unknown>).message ??
                "登录超时",
            )
          : "登录超时";
      return withSqlFallback(
        {
          status: "error",
          failureKind: "auth",
          endpointId: endpoint.id,
          appCode: endpoint.appCode,
          request: requestMeta,
          httpStatus,
          responseHeaders,
          response: payload,
          message:
            endpoint.appCode === "anduin"
              ? `大风车业务鉴权失败（${msg}）。anduin 走企业微信 WxLoginInterceptor，需要 Cookie/Header access_token，Mars _security_token 无法通过。上游已可达，勿改 default_test_config；请 propose_sql。`
              : `大风车业务鉴权失败（${msg}）。请侧栏重新同步测试环境 SSO / 更新 DFC_API_DEV_SSO_TOKEN 后重试。`,
          sqlFallback,
        },
        endpoint,
        params,
      );
    }

    if (!response.ok) {
      const missingParam = parseSpringMissingParameterMessage(payload);
      if (missingParam) {
        return withSqlFallback(
          {
            status: "skipped",
            failureKind: "missing_params",
            endpointId: endpoint.id,
            appCode: endpoint.appCode,
            request: requestMeta,
            httpStatus,
            responseHeaders,
            response: payload,
            message: `接口 ${endpoint.methodName ?? endpoint.id} 上游返回缺参（${missingParam}）。host 已可达，勿改 default_test_config；请 propose_sql。`,
            sqlFallback,
          },
          endpoint,
          params,
        );
      }

      if (isBotWallWafBlock(httpStatus, usedUrl, payload)) {
        return withSqlFallback(
          {
            status: "error",
            failureKind: "auth",
            endpointId: endpoint.id,
            appCode: endpoint.appCode,
            request: requestMeta,
            httpStatus,
            responseHeaders,
            response: payload,
            message:
              "bot-wall WAF 拦截（403）。同组 ksMini/mini/ttMini 详情接口可达；勿改 default_test_config，请 propose_sql。",
            sqlFallback,
          },
          endpoint,
          params,
        );
      }

      const bodyPreview =
        typeof payload === "string"
          ? payload.slice(0, 240)
          : JSON.stringify(payload).slice(0, 240);
      const network = isNetworkFailure(response.status, bodyPreview);
      return withSqlFallback(
        {
          status: "error",
          failureKind: network ? "network" : "http",
          endpointId: endpoint.id,
          appCode: endpoint.appCode,
          request: requestMeta,
          httpStatus,
          responseHeaders,
          response: payload,
          message: network
            ? `HTTP ${response.status} 服务不可达（网关 upstream 失败）。已尝试 .stable / 内网域名，不是缺参。请检查 ${endpoint.baseUrlEnvKey}（CRM：http://super-mario.stable.dasouche.net；勿用线上 *.souche.com；裸 {app}.dasouche.net 常 503）。测试集群若未部署该服务，请 propose_sql 使用 suggestedSql，禁止向用户索取 shop_code。`
            : `HTTP ${response.status}：${bodyPreview || "请求失败"}。请 propose_sql 回退，勿向用户索取额外参数。`,
          sqlFallback,
        },
        endpoint,
        params,
      );
    }

    const table = normalizeResponse(payload);

    return {
      status: "success",
      endpointId: endpoint.id,
      appCode: endpoint.appCode,
      request: requestMeta,
      httpStatus,
      responseHeaders,
      response: payload,
      table,
      message: `已通过 ${endpoint.appCode} HTTP 接口返回 ${table.rows.length} 条记录。`,
      sqlFallback,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timeout = isAbortError(error);
    return withSqlFallback(
      {
        status: "error",
        failureKind: timeout ? "timeout" : "network",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          body: request.body,
          headers,
        },
        message: timeout
          ? `上游请求超时。host 已可达，该接口可能是长任务；勿改 default_test_config，请 propose_sql。`
          : `网络调用失败：${message}。参数已齐全，请立即 propose_sql 使用 suggestedSql，禁止向用户索取额外参数。`,
        sqlFallback,
      },
      endpoint,
      params,
    );
  }
}

export function isBackendApiConfigured(): boolean {
  return (
    isApiEnabled() &&
    Boolean(process.env.DFC_API_GATEWAY_BASE_URL || process.env.DFC_API_SUPER_MARIO_BASE_URL)
  );
}

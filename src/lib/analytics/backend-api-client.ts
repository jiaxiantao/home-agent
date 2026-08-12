import type { ApiRouteParams, DfcApiEndpoint } from "@/lib/analytics/api-catalog";
import { getDevSsoCredentials } from "@/lib/security/sso-config";
import { getSsoRequestContext } from "@/lib/security/sso-context";

export type BackendApiFailureKind =
  | "missing_params"
  | "not_configured"
  | "network"
  | "http"
  | "skipped";

export type BackendApiCallResult = {
  status: "success" | "not_configured" | "skipped" | "error";
  endpointId: string;
  appCode: string;
  request?: {
    method: string;
    url: string;
    query?: Record<string, string>;
    body?: unknown;
  };
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
};

function isApiEnabled() {
  const flag = process.env.DFC_API_ENABLED?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function resolveBaseUrl(endpoint: DfcApiEndpoint): string | undefined {
  const fromEndpoint = process.env[endpoint.baseUrlEnvKey]?.trim();
  if (fromEndpoint) {
    return fromEndpoint.replace(/\/$/, "");
  }
  const generic = process.env.DFC_API_GATEWAY_BASE_URL?.trim();
  if (generic) {
    return `${generic.replace(/\/$/, "")}/${endpoint.appCode}`;
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
  if (!fallback || fallback.database === "*" || fallback.table === "*") {
    return undefined;
  }

  const db = fallback.database;
  const table = fallback.table;

  if (params.recordId && /customer/i.test(table)) {
    return `SELECT id, name, phone, shop_code, owner, grade, source, date_create, date_update FROM \`${db}\`.\`${table}\` WHERE id = '${escapeSqlLiteral(params.recordId)}' LIMIT 20`;
  }

  if (params.phone && /customer/i.test(table)) {
    return `SELECT id, name, phone, shop_code, owner, grade, source, date_create, date_update FROM \`${db}\`.\`${table}\` WHERE phone = '${escapeSqlLiteral(params.phone)}' LIMIT 20`;
  }

  if (params.phone && /cheniu_user/i.test(table)) {
    return `SELECT user_id, dfc_user_id, name, phone, area, address, is_auth, app_source, date_create FROM \`${db}\`.\`${table}\` WHERE phone = '${escapeSqlLiteral(params.phone)}' AND date_delete IS NULL LIMIT 20`;
  }

  if (params.recordId && /cheniu_user/i.test(table)) {
    const id = escapeSqlLiteral(params.recordId);
    return `SELECT user_id, dfc_user_id, name, phone, area, address, is_auth, app_source, date_create FROM \`${db}\`.\`${table}\` WHERE (user_id = '${id}' OR dfc_user_id = '${id}') AND date_delete IS NULL LIMIT 20`;
  }

  return undefined;
}

function isNetworkFailure(status: number, bodyText: string) {
  if ([502, 503, 504].includes(status)) return true;
  return /upstream connect error|connection (?:refused|reset|failure)|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(
    bodyText,
  );
}

function buildRequest(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
): { url: string; method: string; query?: Record<string, string>; body?: unknown } | null {
  if (!endpoint.http) {
    return null;
  }

  const base = resolveBaseUrl(endpoint);
  if (!base) {
    return null;
  }

  const url = new URL(
    `${base}${endpoint.http.path.startsWith("/") ? "" : "/"}${endpoint.http.path}`,
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

  let body: unknown;
  if (endpoint.http.bodyTemplate) {
    body = JSON.parse(
      JSON.stringify(endpoint.http.bodyTemplate).replace(
        /\{\{(\w+)\}\}/g,
        (_, key: string) => String(params[key as keyof ApiRouteParams] ?? ""),
      ),
    );
  }

  return {
    url: url.toString(),
    method: endpoint.http.method,
    query: Object.keys(query).length ? query : undefined,
    body: endpoint.http.method === "POST" ? body : undefined,
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

export async function callBackendApi(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
): Promise<BackendApiCallResult> {
  const sqlFallback = endpoint.sqlFallback;

  if (endpoint.kind === "dubbo" || !endpoint.http) {
    return withSqlFallback(
      {
        status: "skipped",
        failureKind: "skipped",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        message: `接口 ${endpoint.id} 为 Dubbo（${endpoint.dubbo?.interfaceName}.${endpoint.dubbo?.method}），Agent 无法直连 RPC。请直接 propose_sql 使用下方 suggestedSql / SQL 回退。`,
        sqlFallback,
      },
      endpoint,
      params,
    );
  }

  if (!endpoint.readOnly) {
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

  const request = buildRequest(endpoint, params);
  if (!request) {
    return withSqlFallback(
      {
        status: "not_configured",
        failureKind: "not_configured",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        message: `未配置 ${endpoint.baseUrlEnvKey} 或 DFC_API_GATEWAY_BASE_URL。参数已齐全时请直接 propose_sql，勿向用户索取额外参数。`,
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

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const sso = getSsoRequestContext() ?? getDevSsoCredentials();
  if (sso) {
    headers[sso.tokenHeader] = sso.token;
    if (sso.cookieHeader) {
      headers.Cookie = sso.cookieHeader;
    }
  } else {
    const token = process.env.DFC_API_AUTH_TOKEN?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const serviceChain = process.env.DFC_API_SERVICE_CHAIN?.trim();
  if (serviceChain) {
    headers["X-Souche-ServiceChain"] = serviceChain;
  }

  const timeoutMs = Number(process.env.DFC_API_TIMEOUT_MS ?? 12000);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // keep text
    }

    if (!response.ok) {
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
          request: {
            method: request.method,
            url: request.url,
            query: request.query,
            body: request.body,
          },
          response: payload,
          message: network
            ? `HTTP ${response.status} 服务不可达（网关 upstream 失败）。请求参数已齐全（见 URL query），不是缺参。请立即 propose_sql 使用 suggestedSql，禁止向用户索取 shop_code。`
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
      request: {
        method: request.method,
        url: request.url,
        query: request.query,
        body: request.body,
      },
      response: payload,
      table,
      message: `已通过 ${endpoint.appCode} HTTP 接口返回 ${table.rows.length} 条记录。`,
      sqlFallback,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return withSqlFallback(
      {
        status: "error",
        failureKind: "network",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          body: request.body,
        },
        message: `网络调用失败：${message}。参数已齐全，请立即 propose_sql 使用 suggestedSql，禁止向用户索取 shop_code。`,
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

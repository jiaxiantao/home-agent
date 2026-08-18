import type { ApiRouteParams } from "@/lib/analytics/api-catalog-types";
import {
  getDfcApiCatalogSource,
  getDfcApiEndpointById,
} from "@/lib/analytics/api-catalog-store";
import {
  ensureDfcApiCatalogFromDatabase,
  getDfcApiEndpointRecord,
  resolveTestConfigForEndpoint,
  resolveTestParamsForEndpoints,
} from "@/lib/analytics/dfc-api-endpoints";
import type { DfcApiTestConfig } from "@/lib/analytics/dfc-api-test-config";
import {
  assertTestSafeUpstreamUrl,
  callBackendApi,
  formatNotConfiguredBaseUrlMessage,
  isDfcApiEndpointEnvConfigured,
  previewBackendApiCallWithFallback,
  resolveDfcApiEndpointBaseUrl,
} from "@/lib/analytics/backend-api-client";
import { shouldSkipHttpProbe, shouldSkipHttpProbeEndpoint } from "@/lib/analytics/dfc-api-test-hosts";
import { isDfcApiCatalogNoiseEndpoint } from "@/lib/analytics/dfc-api-catalog-noise";
import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import {
  applyLoggedInUserToApiParams,
  applyLoggedInUserToBody,
  applyLoggedInUserToQuery,
  getCachedDfcUserProfile,
  resolveDfcUserProfileFromSso,
} from "@/lib/security/dfc-user-profile";
import { getDevSsoCredentials } from "@/lib/security/sso-config";
import { getSsoRequestContext } from "@/lib/security/sso-context";

export type DfcApiTestRequestPreview = {
  kind: "http" | "dubbo";
  method?: string;
  url?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  dubbo?: {
    interfaceName: string;
    method: string;
    params: ApiRouteParams;
  };
  envConfigured: boolean;
  baseUrlEnvKey: string;
};

export type DfcApiTestResult = {
  endpointId: string;
  title: string;
  kind: "http" | "dubbo";
  ok: boolean;
  durationMs: number;
  status: string;
  message: string;
  warning?: string;
  envConfigured?: boolean;
  request?: DfcApiTestRequestPreview;
  response?: {
    httpStatus?: number;
    headers?: Record<string, string>;
    body?: unknown;
  };
};

export type DfcApiTestOptions = {
  params?: ApiRouteParams;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  cookies?: Record<string, string>;
};

function resolveEnvConfigured(endpoint: DfcApiEndpoint) {
  return isDfcApiEndpointEnvConfigured(endpoint);
}

async function resolveEndpoint(endpointId: string) {
  if (getDfcApiCatalogSource()) {
    return getDfcApiEndpointById(endpointId);
  }

  await ensureDfcApiCatalogFromDatabase();
  const record = await getDfcApiEndpointRecord(endpointId);
  if (record) {
    return record.endpoint;
  }
  return getDfcApiEndpointById(endpointId);
}

function mapHttpPreview(
  endpoint: NonNullable<Awaited<ReturnType<typeof resolveEndpoint>>>,
  config: DfcApiTestConfig,
  runtimeHeaders?: Record<string, string>,
): DfcApiTestRequestPreview | undefined {
  const preview = previewBackendApiCallWithFallback(endpoint, config.params, {
    extraHeaders: config.headers,
    extraQuery: config.query,
    extraBody: config.body,
    extraCookies: config.cookies,
  });
  if (!preview) {
    return undefined;
  }
  return {
    kind: "http",
    method: preview.method,
    url: preview.url,
    query: preview.query,
    body: preview.body,
    headers: preview.headers,
    cookies: config.cookies,
    envConfigured: resolveEnvConfigured(endpoint),
    baseUrlEnvKey: endpoint.baseUrlEnvKey,
  };
}

async function enrichTestConfigWithLoggedInUser(
  config: DfcApiTestConfig,
): Promise<DfcApiTestConfig> {
  const sso = getSsoRequestContext() ?? getDevSsoCredentials();
  if (!sso) {
    return config;
  }
  const user =
    getCachedDfcUserProfile(sso) ?? (await resolveDfcUserProfileFromSso(sso));
  if (!user?.linked) {
    return config;
  }
  return {
    ...config,
    params: applyLoggedInUserToApiParams(config.params, user),
    query: applyLoggedInUserToQuery(config.query, user) ?? {},
    body:
      config.body && typeof config.body === "object" && !Array.isArray(config.body)
        ? applyLoggedInUserToBody(
            config.body as Record<string, unknown>,
            user,
          )
        : config.body,
  };
}

export async function previewDfcApiEndpointRequest(
  endpointId: string,
  options?: DfcApiTestOptions,
): Promise<DfcApiTestRequestPreview | null> {
  const trimmed = endpointId.trim();
  const endpoint = await resolveEndpoint(trimmed);
  if (!endpoint) {
    return null;
  }

  const config = await enrichTestConfigWithLoggedInUser(
    await resolveTestConfigForEndpoint(trimmed, options),
  );
  const envConfigured = resolveEnvConfigured(endpoint);

  if (!endpoint.http) {
    return null;
  }

  return (
    mapHttpPreview(endpoint, config, options?.headers) ?? {
      kind: "http",
      envConfigured,
      baseUrlEnvKey: endpoint.baseUrlEnvKey,
    }
  );
}

export async function testDfcApiEndpoint(
  endpointId: string,
  options?: DfcApiTestOptions,
): Promise<DfcApiTestResult> {
  const trimmed = endpointId.trim();
  const started = Date.now();
  const endpoint = await resolveEndpoint(trimmed);

  if (!endpoint) {
    return {
      endpointId: trimmed,
      title: trimmed,
      kind: "http",
      ok: false,
      durationMs: Date.now() - started,
      status: "missing",
      message: "接口不存在于目录中",
    };
  }

  const config = await enrichTestConfigWithLoggedInUser(
    await resolveTestConfigForEndpoint(trimmed, options),
  );
  const envConfigured = resolveEnvConfigured(endpoint);
  const requestPreview = await previewDfcApiEndpointRequest(trimmed, options);

  if (!endpoint.http) {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs: Date.now() - started,
      status: "missing",
      envConfigured,
      message: "接口缺少 HTTP 定义，无法探测",
      request: requestPreview ?? undefined,
    };
  }

  if (isDfcApiCatalogNoiseEndpoint(endpoint)) {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs: Date.now() - started,
      status: "skipped",
      envConfigured,
      message:
        "该 HTTP 映射已在源码中注释/下线（探测会 404），已跳过。请用仍存在的同组接口或 SQL，勿改 default_test_config。",
      warning: "不是缺参；Spring 映射已删除。",
      request: requestPreview ?? undefined,
    };
  }

  if (shouldSkipHttpProbeEndpoint(endpoint.id)) {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs: Date.now() - started,
      status: "skipped",
      envConfigured,
      message:
        "该接口是长耗时后台初始化任务，目录探测已跳过。上游应用可达，勿改 default_test_config；请 propose_sql。",
      warning: "不是缺参或域名错误。",
      request: requestPreview ?? undefined,
    };
  }

  if (shouldSkipHttpProbe(endpoint.appCode)) {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs: Date.now() - started,
      status: "skipped",
      envConfigured,
      message: `${endpoint.appCode} 测试集群无可用 HTTP 实例（网关 503），已跳过探测。目录保留供 SQL 回退，勿改 default_test_config。`,
      warning: "不是缺参；该服务当前未部署到可探测的测试网关。",
      request: requestPreview ?? undefined,
    };
  }

  if (!envConfigured) {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs: Date.now() - started,
      status: "not_configured",
      envConfigured: false,
      message: formatNotConfiguredBaseUrlMessage(endpoint.baseUrlEnvKey),
      request: requestPreview ?? undefined,
    };
  }

  const baseUrl = resolveDfcApiEndpointBaseUrl(endpoint);
  if (baseUrl) {
    const unsafe = assertTestSafeUpstreamUrl(baseUrl);
    if (unsafe) {
      return {
        endpointId: endpoint.id,
        title: endpoint.title,
        kind: "http",
        ok: false,
        durationMs: Date.now() - started,
        status: "blocked",
        envConfigured: true,
        message: unsafe,
        request: requestPreview ?? undefined,
      };
    }
  }

  const result = await callBackendApi(endpoint, config.params, {
    extraHeaders: config.headers,
    extraQuery: config.query,
    extraBody: endpoint.http?.bodyTemplate ? undefined : config.body,
    extraCookies: config.cookies,
    allowWrite: true,
  });
  const durationMs = Date.now() - started;
  const httpRequest = requestPreview ?? mapHttpPreview(endpoint, config, options?.headers);
  if (httpRequest && result.request?.url) {
    httpRequest.url = result.request.url;
  }
  const response = {
    httpStatus: result.httpStatus,
    headers: result.responseHeaders,
    body: result.response,
  };

  if (result.status === "success") {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: true,
      durationMs,
      status: result.status,
      message: result.message,
      envConfigured: true,
      request: httpRequest,
      response,
    };
  }

  if (result.failureKind === "missing_params") {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs,
      status: "reachable",
      envConfigured: true,
      message: result.message,
      warning: "上游可达，但缺少业务参数；可在编辑接口时补充 default_test_params",
      request: httpRequest,
      response,
    };
  }

  if (result.failureKind === "auth") {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs,
      status: "auth",
      envConfigured: true,
      message: result.message,
      warning:
        endpoint.appCode === "anduin"
          ? "上游可达。anduin CRM 运营接口需要企业微信 access_token，不是大风车 Mars SSO；勿改 default_test_config。"
          : "上游可达，但当前登录态不被该服务接受。请侧栏同步对应环境 SSO；不是缺参。",
      request: httpRequest,
      response,
    };
  }

  if (result.failureKind === "network") {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs,
      status: "upstream_unavailable",
      envConfigured: true,
      message: result.message,
      warning:
        "网关 503 / upstream 失败，不是缺参。优先改 DFC_API_*_BASE_URL 为 *.stable.dasouche.net；若仍 503 则测试集群未部署，请走 SQL，勿改 default_test_config。",
      request: httpRequest,
      response,
    };
  }

  if (
    result.failureKind === "timeout" ||
    (result.failureKind === "http" && (result.httpStatus ?? 0) >= 500)
  ) {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "http",
      ok: false,
      durationMs,
      status: "upstream_error",
      envConfigured: true,
      message: result.message,
      warning:
        result.failureKind === "timeout"
          ? "上游已可达但请求超时（未换域名重试）。勿改 default_test_config；请 propose_sql。"
          : "上游已可达（应用返回 5xx，不是网关 503）。目录与 host 无误，勿改 default_test_config；请 propose_sql。",
      request: httpRequest,
      response,
    };
  }

  return {
    endpointId: endpoint.id,
    title: endpoint.title,
    kind: "http",
    ok: false,
    durationMs,
    status: result.status,
    envConfigured: true,
    message: result.message,
    request: httpRequest,
    response,
  };
}

export async function testDfcApiEndpointsBatch(
  endpointIds: string[],
  options?: {
    params?: ApiRouteParams;
    paramsByEndpoint?: Record<string, ApiRouteParams>;
    concurrency?: number;
  },
) {
  const unique = [...new Set(endpointIds.map((item) => item.trim()).filter(Boolean))];
  const concurrency = Math.min(Math.max(options?.concurrency ?? 2, 1), 4);
  const paramsMap = await resolveTestParamsForEndpoints(
    unique,
    options?.params,
    options?.paramsByEndpoint,
  );
  const results: DfcApiTestResult[] = [];

  for (let index = 0; index < unique.length; index += concurrency) {
    const chunk = unique.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((endpointId) =>
        testDfcApiEndpoint(endpointId, { params: paramsMap[endpointId] }),
      ),
    );
    results.push(...chunkResults);
  }

  return {
    total: unique.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}

export async function* testDfcApiEndpointsBatchStream(
  endpointIds: string[],
  options?: {
    params?: ApiRouteParams;
    paramsByEndpoint?: Record<string, ApiRouteParams>;
    concurrency?: number;
  },
): AsyncGenerator<
  { type: "testing"; endpointId: string } | { type: "result"; result: DfcApiTestResult }
> {
  const unique = [...new Set(endpointIds.map((item) => item.trim()).filter(Boolean))];
  const concurrency = Math.min(Math.max(options?.concurrency ?? 2, 1), 4);
  const paramsMap = await resolveTestParamsForEndpoints(
    unique,
    options?.params,
    options?.paramsByEndpoint,
  );

  for (let index = 0; index < unique.length; index += concurrency) {
    const chunk = unique.slice(index, index + concurrency);
    for (const endpointId of chunk) {
      yield { type: "testing", endpointId };
    }
    const chunkResults = await Promise.all(
      chunk.map((endpointId) =>
        testDfcApiEndpoint(endpointId, { params: paramsMap[endpointId] }),
      ),
    );
    for (const result of chunkResults) {
      yield { type: "result", result };
    }
  }
}

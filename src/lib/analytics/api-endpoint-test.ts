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
} from "@/lib/analytics/backend-api-client";
import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";

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

export async function previewDfcApiEndpointRequest(
  endpointId: string,
  options?: DfcApiTestOptions,
): Promise<DfcApiTestRequestPreview | null> {
  const trimmed = endpointId.trim();
  const endpoint = await resolveEndpoint(trimmed);
  if (!endpoint) {
    return null;
  }

  const config = await resolveTestConfigForEndpoint(trimmed, options);
  const envConfigured = resolveEnvConfigured(endpoint);

  if (endpoint.kind === "dubbo" || !endpoint.http) {
    return {
      kind: "dubbo",
      dubbo: {
        interfaceName: endpoint.dubbo?.interfaceName ?? "",
        method: endpoint.dubbo?.method ?? "",
        params: config.params,
      },
      envConfigured,
      baseUrlEnvKey: endpoint.baseUrlEnvKey,
    };
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

  const config = await resolveTestConfigForEndpoint(trimmed, options);
  const envConfigured = resolveEnvConfigured(endpoint);
  const requestPreview = await previewDfcApiEndpointRequest(trimmed, options);

  if (endpoint.kind === "dubbo" || !endpoint.http) {
    return {
      endpointId: endpoint.id,
      title: endpoint.title,
      kind: "dubbo",
      ok: true,
      durationMs: Date.now() - started,
      status: "catalog",
      envConfigured,
      message: `Dubbo 接口已登记：${endpoint.dubbo?.interfaceName}.${endpoint.dubbo?.method}`,
      warning: envConfigured
        ? "RPC 无法直连，目录与环境变量配置正常"
        : `未配置 ${endpoint.baseUrlEnvKey}，仅目录可达`,
      request: requestPreview ?? undefined,
      response: {
        body: {
          note: "Dubbo RPC 无法通过 HTTP 探测，仅展示登记信息与入参",
          params: config.params,
          body: config.body,
          cookies: config.cookies,
        },
      },
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

  const baseProbe = process.env[endpoint.baseUrlEnvKey]?.trim();
  if (baseProbe) {
    const unsafe = assertTestSafeUpstreamUrl(baseProbe);
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
      ok: true,
      durationMs,
      status: "reachable",
      envConfigured: true,
      message: result.message,
      warning: "上游可达，但缺少业务参数；可在编辑接口时补充 default_test_params",
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

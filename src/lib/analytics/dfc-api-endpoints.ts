import { isAppMysqlConfigured } from "@/lib/app-mysql/client";
import { isDfcApiCatalogNoiseEndpoint } from "@/lib/analytics/dfc-api-catalog-noise";
import {
  batchUpsertMysqlDfcApiEndpoints,
  countMysqlDfcApiEndpoints,
  deleteMysqlDfcApiEndpoint,
  deleteMysqlDfcApiEndpointsByKind,
  deleteMysqlSeededEndpointsNotIn,
  ensureDfcApiEndpointsTable,
  getDefaultTestParamsByEndpointId,
  getDefaultTestParamsMap,
  getMysqlDfcApiEndpointById,
  listAllMysqlDfcApiEndpoints,
  listMysqlDfcApiAppSummaries,
  listMysqlDfcApiEndpointsPage,
  updateMysqlDfcApiEndpoint,
  upsertMysqlDfcApiEndpoint,
  type DfcApiAppSummary,
} from "@/lib/analytics/dfc-api-endpoints-mysql";
import { toListItem } from "@/lib/analytics/dfc-api-endpoint-serialize";
import {
  resetDfcApiCatalogCache,
  setDfcApiCatalogCache,
  getDfcApiCatalogSource,
  getDfcApiEndpointById,
} from "@/lib/analytics/api-catalog-store";
import type { ApiRouteParams, DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import {
  defaultBackendRoot,
  inferDefaultTestConfig,
  mergeTestConfig,
  type DfcApiTestConfig,
} from "@/lib/analytics/dfc-api-test-config";

function requireAppMysql() {
  if (!isAppMysqlConfigured()) {
    throw new Error("未配置 APP_MYSQL_*，接口目录仅从 MySQL 读取");
  }
}

export async function ensureDfcApiCatalogFromDatabase() {
  requireAppMysql();
  await ensureDfcApiEndpointsTable();
  const total = await countMysqlDfcApiEndpoints();
  if (total === 0) {
    throw new Error("dfc_api_endpoints 为空，请先执行 pnpm db:sync-apis 导入目录");
  }

  const records = await listAllMysqlDfcApiEndpoints();
  const endpoints = records
    .map((item) => item.endpoint)
    .filter((item) => !isDfcApiCatalogNoiseEndpoint(item));
  setDfcApiCatalogCache(endpoints, {
    total,
    stats: { total, source: "mysql", http: endpoints.filter((e) => e.kind === "http").length },
  });
  return endpoints;
}

export type { DfcApiAppSummary };

export async function listDfcApiAppSummaries() {
  requireAppMysql();
  await ensureDfcApiEndpointsTable();
  return listMysqlDfcApiAppSummaries();
}

export async function listDfcApiEndpointsPage(options?: {
  page?: number;
  pageSize?: number;
  q?: string;
  kind?: "all" | "http" | "dubbo";
  appCode?: string;
}) {
  requireAppMysql();
  await ensureDfcApiCatalogFromDatabase();
  const result = await listMysqlDfcApiEndpointsPage(options);
  const visible = result.items.filter(
    (item) => !isDfcApiCatalogNoiseEndpoint(item.endpoint),
  );
  return {
    items: visible.map(toListItem),
    total: Math.max(0, result.total - (result.items.length - visible.length)),
    page: result.page,
    pageSize: result.pageSize,
    catalogSize: result.catalogSize,
    storage: "mysql" as const,
  };
}

export async function getDfcApiEndpointRecord(id: string) {
  requireAppMysql();
  return getMysqlDfcApiEndpointById(id);
}

export async function createDfcApiEndpoint(input: {
  endpoint: DfcApiEndpoint;
  defaultTestParams?: ApiRouteParams;
  defaultTestConfig?: DfcApiTestConfig;
  enabled?: boolean;
  createdBy: string;
}) {
  requireAppMysql();
  const record = await upsertMysqlDfcApiEndpoint({
    endpoint: input.endpoint,
    defaultTestParams: input.defaultTestParams,
    defaultTestConfig: input.defaultTestConfig,
    seeded: false,
    enabled: input.enabled,
    createdBy: input.createdBy,
  });
  resetDfcApiCatalogCache();
  await ensureDfcApiCatalogFromDatabase();
  return record;
}

export async function updateDfcApiEndpoint(
  id: string,
  input: {
    title?: string;
    description?: string;
    readOnly?: boolean;
    enabled?: boolean;
    defaultTestParams?: ApiRouteParams;
    defaultTestConfig?: DfcApiTestConfig;
    endpoint?: DfcApiEndpoint;
  },
) {
  requireAppMysql();
  const record = await updateMysqlDfcApiEndpoint(id, input);
  if (record) {
    resetDfcApiCatalogCache();
    await ensureDfcApiCatalogFromDatabase();
  }
  return record;
}

export async function deleteDfcApiEndpoint(id: string) {
  requireAppMysql();
  const removed = await deleteMysqlDfcApiEndpoint(id);
  if (removed) {
    resetDfcApiCatalogCache();
    await ensureDfcApiCatalogFromDatabase();
  }
  return removed;
}

export async function syncDfcApiEndpointsToDatabase(endpoints: DfcApiEndpoint[]) {
  requireAppMysql();
  await ensureDfcApiEndpointsTable();
  const httpOnly = endpoints.filter((item) => item.kind === "http" && item.http);
  const affected = await batchUpsertMysqlDfcApiEndpoints(httpOnly, {
    seeded: true,
    createdBy: "system",
  });
  const removedDubbo = await deleteMysqlDfcApiEndpointsByKind("dubbo");
  const pruned = await deleteMysqlSeededEndpointsNotIn(
    httpOnly.map((item) => item.id),
  );
  resetDfcApiCatalogCache();
  await ensureDfcApiCatalogFromDatabase();
  return { affected, removed: removedDubbo + pruned };
}

export async function exportDfcApiEndpointsFromDatabase() {
  requireAppMysql();
  await ensureDfcApiEndpointsTable();
  const records = await listAllMysqlDfcApiEndpoints();
  return records.map((item) => item.endpoint);
}

export async function resolveTestConfigForEndpoint(
  endpointId: string,
  override?: {
    params?: ApiRouteParams;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    cookies?: Record<string, string>;
    body?: Record<string, unknown>;
  },
): Promise<DfcApiTestConfig> {
  const backendRoot = process.env.DFC_BACKEND_ROOT?.trim() || defaultBackendRoot() || undefined;

  if (!isAppMysqlConfigured()) {
    const cached = getDfcApiEndpointById(endpointId);
    if (cached) {
      const inferred = inferDefaultTestConfig(cached, { backendRoot });
      return {
        params: { ...inferred.params, ...(override?.params ?? {}) },
        headers: { ...inferred.headers, ...(override?.headers ?? {}) },
        query: { ...inferred.query, ...(override?.query ?? {}) },
        cookies: { ...(inferred.cookies ?? {}), ...(override?.cookies ?? {}) },
        body: override?.body ?? inferred.body,
      };
    }
    return {
      params: override?.params ?? {},
      headers: override?.headers ?? {},
      query: override?.query ?? {},
      cookies: override?.cookies ?? {},
      body: override?.body,
    };
  }

  if (!getDfcApiCatalogSource()) {
    await ensureDfcApiCatalogFromDatabase();
  }

  const record = await getMysqlDfcApiEndpointById(endpointId);
  if (!record) {
    return {
      params: override?.params ?? {},
      headers: override?.headers ?? {},
      query: override?.query ?? {},
      cookies: override?.cookies ?? {},
      body: override?.body,
    };
  }

  const merged = mergeTestConfig(
    record.defaultTestConfig,
    record.endpoint,
    backendRoot ? { backendRoot } : { skipJavaSource: true },
  );

  return {
    params: { ...merged.params, ...(override?.params ?? {}) },
    headers: { ...merged.headers, ...(override?.headers ?? {}) },
    query: { ...merged.query, ...(override?.query ?? {}) },
    cookies: { ...(merged.cookies ?? {}), ...(override?.cookies ?? {}) },
    body: override?.body ?? merged.body,
  };
}

export async function resolveTestParamsForEndpoint(
  endpointId: string,
  override?: ApiRouteParams,
) {
  const config = await resolveTestConfigForEndpoint(endpointId, { params: override });
  return config.params;
}

export async function resolveTestParamsForEndpoints(
  endpointIds: string[],
  override?: ApiRouteParams,
  overrideByEndpoint?: Record<string, ApiRouteParams>,
) {
  const map = await getDefaultTestParamsMap(endpointIds);
  return Object.fromEntries(
    endpointIds.map((id) => [
      id,
      {
        ...(map[id] ?? {}),
        ...(override ?? {}),
        ...(overrideByEndpoint?.[id] ?? {}),
      },
    ]),
  ) as Record<string, ApiRouteParams>;
}

export { getDefaultTestParamsByEndpointId };

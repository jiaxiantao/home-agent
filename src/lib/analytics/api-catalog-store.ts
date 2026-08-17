import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";

let cachedCatalog: DfcApiEndpoint[] | null = null;
let cachedStats: Record<string, unknown> | null = null;

export function setDfcApiCatalogCache(
  endpoints: DfcApiEndpoint[],
  meta?: { total?: number; stats?: Record<string, unknown> },
) {
  cachedCatalog = endpoints;
  cachedStats = meta?.stats ?? {
    total: meta?.total ?? endpoints.length,
    source: "mysql",
  };
}

export function getDfcApiCatalogSource() {
  return cachedCatalog ? "mysql" : null;
}

export function loadDfcApiCatalog(): DfcApiEndpoint[] {
  return cachedCatalog ?? [];
}

export function getDfcApiCatalogStats() {
  return cachedStats;
}

export function getDfcApiEndpointById(id: string): DfcApiEndpoint | undefined {
  return loadDfcApiCatalog().find((item) => item.id === id);
}

export function resetDfcApiCatalogCache() {
  cachedCatalog = null;
  cachedStats = null;
}

export function assertDfcApiCatalogLoaded() {
  if (!cachedCatalog?.length) {
    throw new Error(
      "接口目录未从 MySQL 加载。请配置 APP_MYSQL_* 并执行 pnpm db:sync-apis",
    );
  }
  return cachedCatalog;
}

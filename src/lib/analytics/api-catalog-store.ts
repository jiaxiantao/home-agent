import fs from "node:fs";
import path from "node:path";

import type { DfcApiEndpoint, DfcApiKind } from "@/lib/analytics/api-catalog-types";

type RawCatalogFile = {
  generatedAt: string;
  sourceRoot: string;
  stats: Record<string, unknown>;
  endpoints: Array<Record<string, unknown>>;
};

let cachedCatalog: DfcApiEndpoint[] | null = null;
let cachedStats: RawCatalogFile["stats"] | null = null;

function catalogPath() {
  return path.join(process.cwd(), "config/dfc-api-catalog.json");
}

function normalizeEndpoint(raw: Record<string, unknown>): DfcApiEndpoint {
  const kind = raw.kind as DfcApiKind;
  const matchPatternsRaw = raw.matchPatterns as string[] | undefined;
  const matchPatterns = (matchPatternsRaw ?? []).map((p) => new RegExp(p, "i"));

  const httpFromCurated = raw.http as DfcApiEndpoint["http"] | undefined;
  const method = (raw.method as string | undefined) ?? httpFromCurated?.method;
  const pathStr = (raw.path as string | undefined) ?? httpFromCurated?.path;

  const http =
    kind === "http" && method && pathStr
      ? {
          method: method as "GET" | "POST",
          path: pathStr,
          queryParams: httpFromCurated?.queryParams,
          bodyTemplate: httpFromCurated?.bodyTemplate,
        }
      : httpFromCurated;

  const dubboFromCurated = raw.dubbo as DfcApiEndpoint["dubbo"] | undefined;
  const dubbo =
    kind === "dubbo"
      ? dubboFromCurated ?? {
          interfaceName: String(raw.interfaceName ?? ""),
          method: String(raw.methodName ?? ""),
          paramHints: String(raw.paramHints ?? ""),
        }
      : dubboFromCurated;

  return {
    id: String(raw.id),
    appCode: String(raw.appCode),
    repo: String(raw.repo),
    entity: String(raw.entity ?? "general"),
    title: String(raw.title ?? raw.summary ?? raw.methodName ?? raw.id),
    description: String(raw.description ?? raw.summary ?? ""),
    matchPatterns,
    kind,
    readOnly: Boolean(raw.readOnly),
    preferOverSql: Boolean(raw.preferOverSql),
    http,
    dubbo,
    keywords: Array.isArray(raw.keywords) ? (raw.keywords as string[]) : [],
    methodName: raw.methodName ? String(raw.methodName) : undefined,
    className: raw.className ? String(raw.className) : undefined,
    sqlFallback: (raw.sqlFallback as DfcApiEndpoint["sqlFallback"]) ?? {
      database: "*",
      table: "*",
      hint: "route_question",
    },
    baseUrlEnvKey: String(raw.baseUrlEnvKey ?? "DFC_API_GATEWAY_BASE_URL"),
    sourceFile: raw.sourceFile ? String(raw.sourceFile) : undefined,
  };
}

function curatedPath() {
  return path.join(process.cwd(), "config/dfc-api-catalog.curated.json");
}

type CuratedOverride = {
  id: string;
  patch?: Record<string, unknown>;
  matchPatterns?: string[];
  http?: DfcApiEndpoint["http"];
  dubbo?: DfcApiEndpoint["dubbo"];
  sqlFallback?: DfcApiEndpoint["sqlFallback"];
  endpoint?: Record<string, unknown>;
};

function normalizeMatchPatterns(raw: unknown): RegExp[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (item instanceof RegExp) return item;
      if (typeof item === "string") return new RegExp(item, "i");
      return null;
    })
    .filter((item): item is RegExp => item !== null);
}

function applyCuratedOverrides(endpoints: DfcApiEndpoint[]): DfcApiEndpoint[] {
  const file = curatedPath();
  if (!fs.existsSync(file)) {
    return endpoints;
  }

  const curated = JSON.parse(fs.readFileSync(file, "utf8")) as {
    overrides?: CuratedOverride[];
  };
  const byId = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));

  for (const item of curated.overrides ?? []) {
    const existing = byId.get(item.id);
    if (existing && item.patch) {
      const { matchPatterns: patchPatterns, http, dubbo, sqlFallback, ...rest } =
        item.patch;
      Object.assign(existing, rest);
      if (http && existing.http) {
        existing.http = { ...existing.http, ...(http as DfcApiEndpoint["http"]) };
      } else if (http) {
        existing.http = http as DfcApiEndpoint["http"];
      }
      if (dubbo && existing.dubbo) {
        existing.dubbo = { ...existing.dubbo, ...(dubbo as DfcApiEndpoint["dubbo"]) };
      } else if (dubbo) {
        existing.dubbo = dubbo as DfcApiEndpoint["dubbo"];
      }
      if (sqlFallback) {
        existing.sqlFallback = sqlFallback as DfcApiEndpoint["sqlFallback"];
      }
      if (patchPatterns) {
        existing.matchPatterns = normalizeMatchPatterns(patchPatterns);
      }
    } else if (item.endpoint) {
      const normalized = normalizeEndpoint(item.endpoint);
      endpoints.push(normalized);
      byId.set(normalized.id, normalized);
    }
  }

  return endpoints;
}

export function loadDfcApiCatalog(): DfcApiEndpoint[] {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const file = catalogPath();
  if (!fs.existsSync(file)) {
    cachedCatalog = [];
    cachedStats = { total: 0 };
    return cachedCatalog;
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as RawCatalogFile;
  cachedStats = parsed.stats;
  cachedCatalog = applyCuratedOverrides(parsed.endpoints.map(normalizeEndpoint));
  return cachedCatalog;
}

export function getDfcApiCatalogStats() {
  loadDfcApiCatalog();
  return cachedStats;
}

export function getDfcApiEndpointById(id: string): DfcApiEndpoint | undefined {
  return loadDfcApiCatalog().find((item) => item.id === id);
}

export function resetDfcApiCatalogCache() {
  cachedCatalog = null;
  cachedStats = null;
}

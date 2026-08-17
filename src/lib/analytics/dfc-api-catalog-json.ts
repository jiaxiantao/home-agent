/**
 * 从 JSON 文件读取接口目录（仅用于 sync / export / 测试预热，运行时不用）。
 */
import fs from "node:fs";
import path from "node:path";

import type { DfcApiEndpoint, DfcApiKind } from "@/lib/analytics/api-catalog-types";
import { normalizeHttpMethod } from "@/lib/analytics/http-methods";
import { serializeDfcApiEndpoint } from "@/lib/analytics/dfc-api-endpoint-serialize";

export type RawCatalogFile = {
  generatedAt: string;
  sourceRoot: string;
  stats: Record<string, unknown>;
  endpoints: Array<Record<string, unknown>>;
};

export function defaultCatalogJsonPath() {
  return path.join(process.cwd(), "config/dfc-api-catalog.json");
}

export function defaultCuratedJsonPath() {
  return path.join(process.cwd(), "config/dfc-api-catalog.curated.json");
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
          method: normalizeHttpMethod(method),
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

export function applyCuratedOverrides(endpoints: DfcApiEndpoint[]): DfcApiEndpoint[] {
  const file = defaultCuratedJsonPath();
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
      const existingById = byId.get(normalized.id);
      if (existingById) {
        Object.assign(existingById, normalized);
      } else {
        endpoints.push(normalized);
        byId.set(normalized.id, normalized);
      }
    }
  }

  return endpoints;
}

export function loadDfcApiCatalogFromJsonFile(
  filePath: string = defaultCatalogJsonPath(),
): DfcApiEndpoint[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`接口目录 JSON 不存在：${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as RawCatalogFile;
  return applyCuratedOverrides(parsed.endpoints.map(normalizeEndpoint));
}

export function buildCatalogJsonFile(
  endpoints: DfcApiEndpoint[],
  meta?: Partial<Pick<RawCatalogFile, "generatedAt" | "sourceRoot" | "stats">>,
): RawCatalogFile {
  const http = endpoints.filter((item) => item.kind === "http").length;
  const dubbo = endpoints.filter((item) => item.kind === "dubbo").length;
  const readOnly = endpoints.filter((item) => item.readOnly).length;
  const apps: Record<string, { http: number; dubbo: number }> = {};
  for (const item of endpoints) {
    const bucket = apps[item.appCode] ?? { http: 0, dubbo: 0 };
    if (item.kind === "http") {
      bucket.http += 1;
    } else {
      bucket.dubbo += 1;
    }
    apps[item.appCode] = bucket;
  }

  return {
    generatedAt: meta?.generatedAt ?? new Date().toISOString(),
    sourceRoot: meta?.sourceRoot ?? "mysql:dfc_api_endpoints",
    stats: meta?.stats ?? {
      total: endpoints.length,
      http,
      dubbo,
      readOnly,
      apps,
      exportedFrom: "mysql",
    },
    endpoints: endpoints.map((endpoint) => serializeDfcApiEndpoint(endpoint)),
  };
}

export function writeCatalogJsonFile(
  endpoints: DfcApiEndpoint[],
  filePath: string = defaultCatalogJsonPath(),
  meta?: Partial<Pick<RawCatalogFile, "generatedAt" | "sourceRoot" | "stats">>,
) {
  const payload = buildCatalogJsonFile(endpoints, meta);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

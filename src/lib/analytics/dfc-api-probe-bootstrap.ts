import type { SsoCredentials } from "@/lib/security/sso-credentials";
import { hashSsoToken } from "@/lib/security/sso-credentials";

export type DfcApiProbeBootstrap = {
  brandCode?: string;
  seriesCode?: string;
  modelCode?: string;
  linked: boolean;
  sources?: string[];
};

const BOOTSTRAP_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  bootstrap: DfcApiProbeBootstrap;
  expiresAt: number;
};

const bootstrapCache = new Map<string, CacheEntry>();

/** 与 estimatePrice 接口返回字段一致：品牌/车系/车型 code */
const BOOTSTRAP_QUERY_ALIASES: Record<string, keyof DfcApiProbeBootstrap> = {
  brandcode: "brandCode",
  brand_code: "brandCode",
  seriescode: "seriesCode",
  series_code: "seriesCode",
  modelcode: "modelCode",
  model_code: "modelCode",
};

function cacheKey(sso: SsoCredentials) {
  return hashSsoToken(sso.token);
}

export function getCachedDfcApiProbeBootstrap(
  sso: SsoCredentials | null | undefined,
): DfcApiProbeBootstrap | null {
  if (!sso?.token) {
    return null;
  }
  const entry = bootstrapCache.get(cacheKey(sso));
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    bootstrapCache.delete(cacheKey(sso));
    return null;
  }
  return entry.bootstrap;
}

export function rememberDfcApiProbeBootstrap(
  sso: SsoCredentials,
  bootstrap: DfcApiProbeBootstrap,
) {
  bootstrapCache.set(cacheKey(sso), {
    bootstrap,
    expiresAt: Date.now() + BOOTSTRAP_TTL_MS,
  });
}

export function clearDfcApiProbeBootstrapCacheForTest() {
  bootstrapCache.clear();
}

function resolvePlugInWebBaseUrl() {
  return (
    process.env.DFC_API_DANUBE_PLUG_IN_WEB_BASE_URL?.trim() ||
    "https://danube-plug-in-web.dasouche.net"
  ).replace(/\/$/, "");
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

function unwrapList(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const record = payload as Record<string, unknown>;
  if (record.success === false) {
    return [];
  }
  const data = record.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function pickCode(item: Record<string, unknown> | undefined): string | undefined {
  if (!item) {
    return undefined;
  }
  for (const key of ["code", "brandCode", "seriesCode", "modelCode"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveDfcApiProbeBootstrap(
  sso: SsoCredentials,
  options?: { refresh?: boolean },
): Promise<DfcApiProbeBootstrap> {
  if (!options?.refresh) {
    const cached = getCachedDfcApiProbeBootstrap(sso);
    if (cached?.linked) {
      return cached;
    }
  }

  const baseUrl = resolvePlugInWebBaseUrl();
  const headers = buildSsoHeaders(sso);
  const sources: string[] = [];

  const brandsPayload = await fetchJson(
    `${baseUrl}/estimatePrice/queryBrands`,
    headers,
  );
  const brandCode = pickCode(unwrapList(brandsPayload)[0]);
  if (brandCode) {
    sources.push("estimatePrice/queryBrands");
  }

  let seriesCode: string | undefined;
  if (brandCode) {
    const seriesPayload = await fetchJson(
      `${baseUrl}/estimatePrice/querySeries?brandCode=${encodeURIComponent(brandCode)}`,
      headers,
    );
    seriesCode = pickCode(unwrapList(seriesPayload)[0]);
    if (seriesCode) {
      sources.push("estimatePrice/querySeries");
    }
  }

  let modelCode: string | undefined;
  if (seriesCode) {
    const modelsPayload = await fetchJson(
      `${baseUrl}/estimatePrice/queryModels?seriesCode=${encodeURIComponent(seriesCode)}`,
      headers,
    );
    modelCode = pickCode(unwrapList(modelsPayload)[0]);
    if (modelCode) {
      sources.push("estimatePrice/queryModels");
    }
  }

  const bootstrap: DfcApiProbeBootstrap = {
    brandCode,
    seriesCode,
    modelCode,
    linked: Boolean(brandCode || seriesCode || modelCode),
    sources: sources.length ? sources : undefined,
  };

  if (bootstrap.linked) {
    rememberDfcApiProbeBootstrap(sso, bootstrap);
  }

  return bootstrap;
}

export function isProbePlaceholderValue(value: unknown): boolean {
  return (
    typeof value === "string" && /^demo(?:[_-][a-z0-9]+)?$/i.test(value.trim())
  );
}

function fillBootstrapAliasValue(
  key: string,
  value: unknown,
  bootstrap: DfcApiProbeBootstrap,
): string | undefined {
  if (!isProbePlaceholderValue(value)) {
    return undefined;
  }
  const field = BOOTSTRAP_QUERY_ALIASES[key.toLowerCase()];
  if (!field) {
    return undefined;
  }
  const filled = bootstrap[field];
  return typeof filled === "string" && filled.trim() ? filled : undefined;
}

export function applyProbeBootstrapToQuery(
  query: Record<string, string> | undefined,
  bootstrap: DfcApiProbeBootstrap | null | undefined,
): Record<string, string> | undefined {
  if (!bootstrap?.linked) {
    return query;
  }
  const next = { ...(query ?? {}) };
  for (const [key, value] of Object.entries(next)) {
    const filled = fillBootstrapAliasValue(key, value, bootstrap);
    if (filled) {
      next[key] = filled;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

export function applyProbeBootstrapToBody(
  body: Record<string, unknown> | undefined,
  bootstrap: DfcApiProbeBootstrap | null | undefined,
): Record<string, unknown> | undefined {
  if (!bootstrap?.linked || !body) {
    return body;
  }
  const next = { ...body };
  for (const [key, value] of Object.entries(next)) {
    const filled = fillBootstrapAliasValue(key, value, bootstrap);
    if (filled) {
      next[key] = filled;
    }
  }
  return next;
}

export function applyProbeBootstrapToApiParams<
  T extends Record<string, unknown>,
>(params: T, bootstrap: DfcApiProbeBootstrap | null | undefined): T {
  if (!bootstrap?.linked) {
    return params;
  }
  const next = { ...params };
  for (const [key, value] of Object.entries(next)) {
    const filled = fillBootstrapAliasValue(key, value, bootstrap);
    if (filled) {
      (next as Record<string, unknown>)[key] = filled;
    }
  }
  return next;
}

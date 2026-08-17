import fs from "node:fs";
import path from "node:path";

import type { ApiRouteParams, DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import { inferDefaultTestParams } from "@/lib/analytics/dfc-api-default-params";
import { httpMethodAllowsBody } from "@/lib/analytics/http-methods";

export type DfcApiTestConfig = {
  params: ApiRouteParams;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: Record<string, unknown>;
  cookies?: Record<string, string>;
};

const CRM_WEB_APPS =
  /^(super-mario|danube-chord|chord|rich-man|glorious-mission|crazyracing-kartrider|danube-chaos|chaos)$/i;

const SAMPLE_BY_FIELD: Record<string, unknown> = {
  businessId: "demo_business_001",
  recordId: "LYa4PsNN4J",
  contact: "16612341112",
  phone: "16612341112",
  weichat: "wx_demo",
  wechat: "wx_demo",
  shopCode: "demo_shop",
  groupCode: "demo_group",
  orgCode: "demo_org",
  departmentCode: "demo_dept",
  objCode: "customer",
  plate: "皖JV066M",
  source: "test",
  params: "{}",
  rtTime: 1.0,
};

function defaultBackendRoot() {
  return (
    process.env.DFC_BACKEND_ROOT?.trim() ||
    path.resolve(process.cwd(), "../dafengche-backend")
  );
}

function needsWebSourceCode(appCode: string) {
  return CRM_WEB_APPS.test(appCode);
}

export function inferDefaultHeaders(endpoint: DfcApiEndpoint): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (needsWebSourceCode(endpoint.appCode)) {
    headers._source_code = "WEB";
  }
  return headers;
}

export function buildDefaultQuery(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (!endpoint.http?.queryParams) {
    return query;
  }
  for (const [queryKey, paramKey] of Object.entries(endpoint.http.queryParams)) {
    const value = params[paramKey as keyof ApiRouteParams];
    if (value != null && value !== "") {
      query[queryKey] = String(value);
    }
  }
  return query;
}

function fillBodyTemplate(
  template: Record<string, unknown> | undefined,
  params: ApiRouteParams,
): Record<string, unknown> | undefined {
  if (!template) {
    return undefined;
  }
  const filled = JSON.parse(
    JSON.stringify(template).replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const value = params[key as keyof ApiRouteParams];
      return value == null ? "" : String(value);
    }),
  ) as Record<string, unknown>;
  return filled;
}

function sampleValueForJavaField(type: string, fieldName: string): unknown {
  if (fieldName in SAMPLE_BY_FIELD) {
    return SAMPLE_BY_FIELD[fieldName];
  }
  const lower = fieldName.toLowerCase();
  if (lower.includes("phone")) return SAMPLE_BY_FIELD.phone;
  if (lower.endsWith("id") || lower.includes("record")) return SAMPLE_BY_FIELD.recordId;
  if (lower.includes("plate") || lower.includes("license")) return SAMPLE_BY_FIELD.plate;
  if (type.includes("List") || type.includes("Set")) return [];
  if (type.includes("Map")) return {};
  if (/Boolean|boolean/.test(type)) return false;
  if (/Integer|int|Long|long|Short|short/.test(type)) return 1;
  if (/Double|double|Float|float/.test(type)) return 1.0;
  if (/BigDecimal/.test(type)) return 0;
  if (/Date/.test(type)) return "2024-01-01T00:00:00+08:00";
  return "demo";
}

function parseDtoBody(dtoPath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(dtoPath)) {
    return undefined;
  }
  const content = fs.readFileSync(dtoPath, "utf8");
  const body: Record<string, unknown> = {};
  for (const match of content.matchAll(/private\s+([\w<>,\[\].\s]+?)\s+(\w+)\s*;/g)) {
    const type = match[1].trim();
    const name = match[2];
    if (name === "serialVersionUID") {
      continue;
    }
    if (/Service$|Mapper$|Repository$|Controller$|Client$/.test(type)) {
      continue;
    }
    body[name] = sampleValueForJavaField(type, name);
  }
  return Object.keys(body).length ? body : undefined;
}

function resolveJavaFile(backendRoot: string, className: string, sourceFile?: string) {
  if (sourceFile) {
    const fromSource = path.join(backendRoot, sourceFile);
    if (
      fs.existsSync(fromSource) &&
      path.basename(fromSource, ".java") === className
    ) {
      return fromSource;
    }
  }

  const matches: string[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "target" || ent.name === ".git" || ent.name === "node_modules") {
        continue;
      }
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.name === `${className}.java`) {
        matches.push(full);
      }
    }
  }
  walk(backendRoot);
  return matches[0];
}

function extractMethodParamsBlock(content: string, methodName: string) {
  const re = new RegExp(
    `public\\s+[\\w<>,\\s\\[\\]?.]+\\s+${methodName}\\s*\\(([^)]*)\\)`,
    "s",
  );
  return re.exec(content)?.[1] ?? "";
}

function inferBodyFromJavaSource(
  endpoint: DfcApiEndpoint,
  backendRoot: string,
): Record<string, unknown> | undefined {
  if (!endpoint.methodName || !endpoint.sourceFile) {
    return undefined;
  }

  const controllerPath = path.join(backendRoot, endpoint.sourceFile);
  if (!fs.existsSync(controllerPath)) {
    return undefined;
  }

  const content = fs.readFileSync(controllerPath, "utf8");
  const paramsBlock = extractMethodParamsBlock(content, endpoint.methodName);
  if (!paramsBlock) {
    return undefined;
  }

  const requestBodyMatch =
    paramsBlock.match(/@RequestBody\s+(?:@Valid\s+)?(\w+)/) ??
    paramsBlock.match(/@Json\s*\([^)]*\)\s*@RequestBody\s+(?:@Valid\s+)?(\w+)/);
  if (requestBodyMatch) {
    const dtoPath = resolveJavaFile(backendRoot, requestBodyMatch[1]);
    if (dtoPath) {
      return parseDtoBody(dtoPath);
    }
  }

  return undefined;
}

function inferQueryFromJavaSource(
  endpoint: DfcApiEndpoint,
  backendRoot: string,
  params: ApiRouteParams,
): Record<string, string> {
  const fromCatalog = buildDefaultQuery(endpoint, params);
  if (Object.keys(fromCatalog).length || !endpoint.methodName || !endpoint.sourceFile) {
    return fromCatalog;
  }

  const controllerPath = path.join(backendRoot, endpoint.sourceFile);
  if (!fs.existsSync(controllerPath)) {
    return fromCatalog;
  }

  const content = fs.readFileSync(controllerPath, "utf8");
  const paramsBlock = extractMethodParamsBlock(content, endpoint.methodName);
  const query = { ...fromCatalog };

  for (const match of paramsBlock.matchAll(/@Param\s*\(\s*"([^"]+)"\s*\)/g)) {
    const key = match[1];
    if (query[key]) {
      continue;
    }
    const paramValue =
      params[key as keyof ApiRouteParams] ??
      SAMPLE_BY_FIELD[key] ??
      (key.toLowerCase().includes("id") ? SAMPLE_BY_FIELD.recordId : "demo");
    query[key] = String(paramValue);
  }

  for (const match of paramsBlock.matchAll(/@RequestParam\s*\(\s*(?:value\s*=\s*)?"([^"]+)"/g)) {
    const key = match[1];
    if (query[key]) {
      continue;
    }
    const paramValue =
      params[key as keyof ApiRouteParams] ??
      SAMPLE_BY_FIELD[key] ??
      "demo";
    query[key] = String(paramValue);
  }

  return query;
}

export function inferDefaultTestConfig(
  endpoint: DfcApiEndpoint,
  options?: { backendRoot?: string },
): DfcApiTestConfig {
  const backendRoot = options?.backendRoot ?? defaultBackendRoot();
  const params = inferDefaultTestParams(endpoint);
  const headers = inferDefaultHeaders(endpoint);
  const query = inferQueryFromJavaSource(endpoint, backendRoot, params);

  let body =
    fillBodyTemplate(endpoint.http?.bodyTemplate, params) ??
    inferBodyFromJavaSource(endpoint, backendRoot);

  if (
    !body &&
    endpoint.http?.method &&
    httpMethodAllowsBody(endpoint.http.method) &&
    endpoint.kind === "http" &&
    Object.keys(query).length === 0 &&
    Object.keys(params).length > 0
  ) {
    body = { ...params } as Record<string, unknown>;
  }

  return {
    params,
    headers,
    query,
    cookies: {},
    ...(body ? { body } : {}),
  };
}

export function parseStoredTestConfig(value: unknown): DfcApiTestConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  return {
    params: (raw.params as ApiRouteParams) ?? {},
    headers: (raw.headers as Record<string, string>) ?? {},
    query: (raw.query as Record<string, string>) ?? {},
    cookies: (raw.cookies as Record<string, string>) ?? {},
    body:
      raw.body && typeof raw.body === "object" && !Array.isArray(raw.body)
        ? (raw.body as Record<string, unknown>)
        : undefined,
  };
}

export function mergeTestConfig(
  stored: DfcApiTestConfig | null,
  endpoint: DfcApiEndpoint,
  options?: { backendRoot?: string },
): DfcApiTestConfig {
  const inferred = inferDefaultTestConfig(endpoint, options);
  if (!stored) {
    return inferred;
  }
  return {
    params: { ...inferred.params, ...stored.params },
    headers: { ...inferred.headers, ...stored.headers },
    query: { ...inferred.query, ...stored.query },
    cookies: stored.cookies ?? inferred.cookies,
    body: stored.body ?? inferred.body,
  };
}

export function normalizePartialTestConfig(
  partial?: Partial<DfcApiTestConfig> | null,
): DfcApiTestConfig | undefined {
  if (!partial) {
    return undefined;
  }
  return {
    params: partial.params ?? {},
    headers: partial.headers ?? {},
    query: partial.query ?? {},
    cookies: partial.cookies ?? {},
    ...(partial.body ? { body: partial.body } : {}),
  };
}

export function legacyParamsToTestConfig(params: ApiRouteParams): DfcApiTestConfig {
  return {
    params,
    headers: {},
    query: {},
    cookies: {},
  };
}

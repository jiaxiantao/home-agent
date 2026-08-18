import fs from "node:fs";
import path from "node:path";

import type { ApiRouteParams, DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import { inferDefaultTestParams } from "@/lib/analytics/dfc-api-default-params";
import { httpMethodAllowsBody } from "@/lib/analytics/http-methods";

export type DfcApiTestConfig = {
  params: ApiRouteParams;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
  cookies?: Record<string, string>;
};

const CRM_WEB_APPS =
  /^(super-mario|danube-chord|chord|rich-man|glorious-mission|crazyracing-kartrider|danube-chaos|chaos)$/i;

const SAMPLE_BY_FIELD: Record<string, unknown> = {
  businessId: "demo_business_001",
  recordId: "LYa4PsNN4J",
  leagueId: "LYa4PsNN4J",
  leagueCarId: "LYa4PsNN4J",
  contact: "16612341112",
  phone: "16612341112",
  weichat: "wx_demo",
  wechat: "wx_demo",
  shopCode: "demo_shop",
  leagueShopCode: "demo_shop",
  groupCode: "demo_group",
  orgCode: "demo_org",
  departmentCode: "demo_dept",
  objCode: "customer",
  plate: "皖JV066M",
  source: "test",
  params: "{}",
  rtTime: 1.0,
  name: "demo_league",
  pageNo: 1,
  pageSize: 20,
};

export function defaultBackendRoot() {
  const fromEnv = process.env.DFC_BACKEND_ROOT?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const catalogPath = path.join(process.cwd(), "config/dfc-api-catalog.json");
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as {
        sourceRoot?: string;
      };
      if (catalog.sourceRoot && fs.existsSync(catalog.sourceRoot)) {
        return catalog.sourceRoot;
      }
    }
  } catch {
    // ignore malformed catalog
  }
  return path.resolve(process.cwd(), "../dafengche-backend");
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

function resolveEnumFirstValue(backendRoot: string, enumTypeName: string): string | null {
  const enumPath = resolveJavaFile(backendRoot, enumTypeName);
  if (!enumPath || !fs.existsSync(enumPath)) return null;
  const content = fs.readFileSync(enumPath, "utf8");
  const match = content.match(/^\s+([A-Z][A-Z0-9_]*)\s*[,(;]/m);
  return match?.[1] ?? null;
}

function sampleValueForJavaField(
  type: string,
  fieldName: string,
  backendRoot: string,
  visited = new Set<string>(),
): unknown {
  // List/Set types always return [] regardless of field name
  if (type.includes("List") || type.includes("Set")) return [];
  if (fieldName in SAMPLE_BY_FIELD) {
    return SAMPLE_BY_FIELD[fieldName];
  }
  const lower = fieldName.toLowerCase();
  if (lower.includes("phone")) return SAMPLE_BY_FIELD.phone;
  if (lower.endsWith("id") || lower.includes("record")) return SAMPLE_BY_FIELD.recordId;
  if (lower.includes("plate") || lower.includes("license")) return SAMPLE_BY_FIELD.plate;
  if (lower.includes("name") && !lower.includes("user")) return SAMPLE_BY_FIELD.name;
  if (lower.includes("pageno") || lower === "page") return SAMPLE_BY_FIELD.pageNo;
  if (lower.includes("pagesize")) return SAMPLE_BY_FIELD.pageSize;
  // Integer-like field names (concurrent, coefficient, count, max, min, minutes etc.)
  if (/concurrent|coefficient|minutes|maxconcurrent/i.test(lower)) return 1;
  if (type.includes("Map")) return {};
  if (/Boolean|boolean/.test(type)) return false;
  if (/\bByte\b/.test(type)) return 1;
  if (/Integer|int|Long|long|Short|short/.test(type)) return 1;
  if (/Double|double|Float|float/.test(type)) return 1.0;
  if (/BigDecimal/.test(type)) return 0;
  if (/Date/.test(type)) return "2024-01-01T00:00:00+08:00";

  const simpleType = type.replace(/<.*>/, "").split(".").pop() ?? type;

  // Enum: read source file and use first enum constant
  if (/Enum$/i.test(simpleType) && !visited.has(simpleType)) {
    const firstVal = resolveEnumFirstValue(backendRoot, simpleType);
    if (firstVal) return firstVal;
  }

  // DTO / Param / VO / Filter etc.: recursively parse
  if (/DTO|Param|VO|Request|Query|Filter/i.test(simpleType) && !visited.has(simpleType)) {
    const nestedPath = resolveJavaFile(backendRoot, simpleType);
    if (nestedPath) {
      return parseDtoBody(nestedPath, backendRoot, visited);
    }
  }

  return "demo";
}

function parseDtoBody(
  dtoPath: string,
  backendRoot: string,
  visited = new Set<string>(),
): Record<string, unknown> | undefined {
  const cacheKey = `${backendRoot}:${dtoPath}`;
  if (visited.size === 0 && dtoBodyCache.has(cacheKey)) {
    return dtoBodyCache.get(cacheKey);
  }

  if (!fs.existsSync(dtoPath)) {
    if (visited.size === 0) {
      dtoBodyCache.set(cacheKey, undefined);
    }
    return undefined;
  }

  const className = path.basename(dtoPath, ".java");
  if (visited.has(className)) {
    return undefined;
  }
  visited.add(className);

  const content = fs.readFileSync(dtoPath, "utf8");
  const body: Record<string, unknown> = {};

  const extendsMatch = content.match(/extends\s+([\w.]+)/);
  if (extendsMatch) {
    const parentName = extendsMatch[1].split(".").pop() ?? extendsMatch[1];
    const parentPath = resolveJavaFile(backendRoot, parentName);
    if (parentPath) {
      Object.assign(body, parseDtoBody(parentPath, backendRoot, visited) ?? {});
    }
  }

  for (const match of content.matchAll(
    /(?:^|\n)\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:private|protected|public)?\s*([\w<>,\[\].\s]+?)\s+(\w+)\s*;/gm,
  )) {
    const type = match[1].trim();
    const name = match[2];
    if (name === "serialVersionUID") {
      continue;
    }
    if (/Service$|Mapper$|Repository$|Controller$|Client$/.test(type)) {
      continue;
    }
    body[name] = sampleValueForJavaField(type, name, backendRoot, visited);
  }

  const result = Object.keys(body).length ? body : undefined;
  if (visited.size <= 1) {
    dtoBodyCache.set(cacheKey, result);
  }
  return result;
}

const javaFileCache = new Map<string, string | undefined>();
const dtoBodyCache = new Map<string, Record<string, unknown> | undefined>();

function resolveJavaFile(backendRoot: string, className: string, sourceFile?: string) {
  const cacheKey = `${backendRoot}:${className}:${sourceFile ?? ""}`;
  if (javaFileCache.has(cacheKey)) {
    return javaFileCache.get(cacheKey);
  }

  let resolved: string | undefined;
  if (sourceFile) {
    const fromSource = path.join(backendRoot, sourceFile);
    if (
      fs.existsSync(fromSource) &&
      path.basename(fromSource, ".java") === className
    ) {
      resolved = fromSource;
    }
  }

  if (!resolved) {
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
    resolved = matches[0];
  }

  javaFileCache.set(cacheKey, resolved);
  return resolved;
}

function extractMethodParamsBlock(content: string, methodName: string) {
  const sigRe = new RegExp(
    `public\\s+[\\w<>,\\s\\[\\]?.]+\\s+${methodName}\\s*\\(`,
    "s",
  );
  const sigMatch = sigRe.exec(content);
  if (!sigMatch) {
    return "";
  }

  let depth = 1;
  let index = sigMatch.index + sigMatch[0].length;
  const start = index;
  while (index < content.length && depth > 0) {
    const char = content[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
    index += 1;
  }
  return content.slice(start, index - 1);
}

function extractRequestBodyType(paramsBlock: string): { kind: "object" | "array"; typeName: string } | null {
  const listMatch = paramsBlock.match(
    /@RequestBody(?:\s+@[\w.]+(?:\([^)]*\))?)*\s+List<([\w.]+)>/,
  );
  if (listMatch?.[1]) {
    return { kind: "array", typeName: listMatch[1].split(".").pop() ?? listMatch[1] };
  }

  const objectMatch = paramsBlock.match(
    /@RequestBody(?:\s+@[\w.]+(?:\([^)]*\))?)*\s+([\w.]+)/,
  );
  if (objectMatch?.[1]) {
    return { kind: "object", typeName: objectMatch[1].split(".").pop() ?? objectMatch[1] };
  }

  return null;
}

function inferBodyFromJavaSource(
  endpoint: DfcApiEndpoint,
  backendRoot: string,
): unknown | undefined {
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

  const requestBody = extractRequestBodyType(paramsBlock);
  if (!requestBody) {
    return undefined;
  }

  const dtoPath = resolveJavaFile(backendRoot, requestBody.typeName);
  if (!dtoPath) {
    return undefined;
  }

  const dtoBody = parseDtoBody(dtoPath, backendRoot);
  if (!dtoBody) {
    return undefined;
  }

  return requestBody.kind === "array" ? [dtoBody] : dtoBody;
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

  // Extract Java type for each method parameter for accurate sample value inference
  // Pattern: @RequestParam("key") SomeType varName  or  @Param("key") SomeType varName
  const javaParamTypes = new Map<string, string>();
  for (const m of paramsBlock.matchAll(
    /(?:@Param|@RequestParam)\s*\(\s*(?:value\s*=\s*)?"([^"]+)"[^)]*\)\s+([\w<>.,\s]+?)\s+\w+/g,
  )) {
    javaParamTypes.set(m[1], m[2].trim());
  }

  function sampleQueryValue(key: string): string {
    const javaType = javaParamTypes.get(key) ?? "";
    if (/Integer|int|Long|long|Short|short|Byte\b/.test(javaType)) return "1";
    if (/Double|double|Float|float|BigDecimal/.test(javaType)) return "1.0";
    if (/Boolean|boolean/.test(javaType)) return "false";
    if (/concurrent|coefficient|minutes|maxconcurrent/i.test(key)) return "1";
    const from =
      params[key as keyof ApiRouteParams] ??
      SAMPLE_BY_FIELD[key] ??
      (key.toLowerCase().includes("id") ? SAMPLE_BY_FIELD.recordId : undefined);
    return from != null ? String(from) : "demo";
  }

  for (const match of paramsBlock.matchAll(/@Param\s*\(\s*(?:value\s*=\s*)?"([^"]+)"/g)) {
    const key = match[1];
    if (query[key]) {
      continue;
    }
    query[key] = sampleQueryValue(key);
  }

  for (const match of paramsBlock.matchAll(/@RequestParam\s*\(\s*(?:value\s*=\s*)?"([^"]+)"/g)) {
    const key = match[1];
    if (query[key]) {
      continue;
    }
    query[key] = sampleQueryValue(key);
  }

  return query;
}

export function inferDefaultTestConfig(
  endpoint: DfcApiEndpoint,
  options?: { backendRoot?: string; skipJavaSource?: boolean },
): DfcApiTestConfig {
  const backendRoot = options?.backendRoot;
  const scanJava = !options?.skipJavaSource && Boolean(backendRoot);
  const resolvedRoot = backendRoot ?? (scanJava ? defaultBackendRoot() : "");
  const params = inferDefaultTestParams(endpoint);
  const headers = inferDefaultHeaders(endpoint);
  const query = scanJava
    ? inferQueryFromJavaSource(endpoint, resolvedRoot, params)
    : buildDefaultQuery(endpoint, params);

  let body =
    fillBodyTemplate(endpoint.http?.bodyTemplate, params) ??
    (scanJava ? inferBodyFromJavaSource(endpoint, resolvedRoot) : undefined);

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
      raw.body !== undefined && typeof raw.body === "object"
        ? raw.body
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

#!/usr/bin/env node
/**
 * 扫描本地 dafengche-backend 仓库，生成 HTTP 接口目录。
 *
 *   DFC_BACKEND_ROOT=/path/to/dafengche-backend node scripts/generate-dfc-api-catalog.mjs
 *   pnpm generate:api-catalog
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKEND_ROOT =
  process.env.DFC_BACKEND_ROOT ||
  path.resolve(PROJECT_ROOT, "../../dafengche-backend");
const OUT_FILE = path.join(PROJECT_ROOT, "config/dfc-api-catalog.json");
const REGISTRY_FILE = path.join(PROJECT_ROOT, "config/dfc-app-registry.json");
const CURATED_FILE = path.join(PROJECT_ROOT, "config/dfc-api-catalog.curated.json");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "target",
  "build",
  ".idea",
  "test-classes",
  "generated-sources",
  "example",
  "examples",
  "demo",
  "samples",
  "sample",
  "playground",
  "mock",
]);

const WRITE_KEYWORDS = /\b(save|update|delete|remove|create|insert|modify|batch|activate|cancel|submit|approve|reject|send|upload|import|export|sync|publish|bind|unbind|disable|enable|add|edit)\b/i;
const READ_KEYWORDS = /\b(get|query|find|search|list|page|detail|info|count|stat|load|fetch|select|lookup|check|exist|validate|preview|export\b.*\bquery)\b/i;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function shouldSkipDirName(name) {
  if (SKIP_DIRS.has(name)) return true;
  return /-(example|examples|demo|samples?|playground|mock)$/i.test(name);
}

function walkJavaFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkipDirName(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJavaFiles(full, out);
    else if (ent.name.endsWith(".java")) out.push(full);
  }
  return out;
}

function slugId(parts) {
  return parts
    .filter(Boolean)
    .join(":")
    .replace(/[^a-zA-Z0-9:/_.-]+/g, "_")
    .slice(0, 180);
}

function inferEntity(text) {
  const t = text.toLowerCase();
  if (/customer|crm|客户|followup|follow_up|intention|线索/.test(t)) return "crm_customer";
  if (/member|会员|vip|membership/.test(t)) return "member";
  if (/cheniu|user|用户|account|auth/.test(t)) return "cheniu_user";
  if (/car|vehicle|车源|kartrider|topcar|inventory/.test(t)) return "car";
  if (/order|订单|deal|成交|richman|rich_man/.test(t)) return "order";
  if (/contract|合同/.test(t)) return "contract";
  if (/lead|clue|线索|maple/.test(t)) return "lead";
  if (/model|车型|vin|starscream/.test(t)) return "car_model";
  if (/market|服务市场|goods|sku/.test(t)) return "service_market";
  if (/scrm|wechat|企微|wx/.test(t)) return "scrm";
  if (/report|报表|thriver|stat/.test(t)) return "report";
  return "general";
}

function tokenizeForSearch(...parts) {
  const raw = parts.filter(Boolean).join(" ");
  const tokens = new Set();
  for (const part of raw.split(/[^a-zA-Z0-9\u4e00-\u9fff]+/)) {
    if (part.length >= 2) tokens.add(part.toLowerCase());
  }
  // camelCase split
  for (const part of parts) {
    if (!part) continue;
    const camel = part.replace(/([a-z])([A-Z])/g, "$1 $2");
    for (const seg of camel.split(/\W+/)) {
      if (seg.length >= 2) tokens.add(seg.toLowerCase());
    }
  }
  return [...tokens];
}

function inferReadOnly(method, methodName, pathStr) {
  const m = method.toUpperCase();
  if (m === "GET") return true;
  const blob = `${methodName} ${pathStr}`.toLowerCase();
  if (WRITE_KEYWORDS.test(blob)) return false;
  if (READ_KEYWORDS.test(blob)) return true;
  if (m === "POST" && /query|search|list|page|get|detail|find/i.test(blob)) return true;
  return false;
}

function joinPaths(base, sub) {
  const b = (base || "").replace(/\/$/, "");
  const s = (sub || "").replace(/^\//, "");
  if (!b) return s.startsWith("/") ? s : `/${s}`;
  if (!s) return b.startsWith("/") ? b : `/${b}`;
  return `${b.startsWith("/") ? b : `/${b}`}/${s}`.replace(/\/+/g, "/");
}

/** Optimus @Rest 相对路径 → /v1/{menuApi}/{action}.json（见 huaguo MenuApi/TrackApi） */
function decapitalizeClassName(className) {
  if (!className) return "";
  return className.charAt(0).toLowerCase() + className.slice(1);
}

function resolveOptimusRestAction(restValue) {
  return restValue.endsWith(".json") ? restValue : `${restValue}.json`;
}

/** danube @View Controller：/danube/.../web/.../{controller}/{action}.json */
function resolveOptimusPackageWebPath(sourceFile, className) {
  const normalized = sourceFile.replaceAll("\\", "/");
  const marker = "/src/main/java/com/souche/";
  const idx = normalized.indexOf(marker);
  if (idx < 0) {
    return null;
  }
  const rel = normalized.slice(idx + marker.length).replace(/\.java$/, "");
  if (!/\/web\//i.test(rel)) {
    return null;
  }
  const parts = rel.split("/");
  parts[parts.length - 1] = decapitalizeClassName(className);
  return `/${parts.join("/")}`;
}

function shouldUseOptimusPackageWebPath(sourceFile, className, restValue) {
  if (!restValue || restValue.startsWith("/")) {
    return false;
  }
  if (!/Controller$/.test(className)) {
    return false;
  }
  return resolveOptimusPackageWebPath(sourceFile, className) !== null;
}

function resolveOptimusRestPath(className, restValue, sourceFile = "") {
  if (!restValue) {
    return `/${decapitalizeClassName(className)}`;
  }
  if (restValue.startsWith("/")) {
    return restValue;
  }
  const action = resolveOptimusRestAction(restValue);
  if (shouldUseOptimusPackageWebPath(sourceFile, className, restValue)) {
    const base = resolveOptimusPackageWebPath(sourceFile, className);
    return `${base}/${action}`;
  }
  const apiSegment = decapitalizeClassName(className);
  return `/v1/${apiSegment}/${action}`;
}

function extractClassBaseMapping(content) {
  const req = content.match(
    /@RequestMapping\s*\(\s*(?:value|path)\s*=\s*["']([^"']*)["']/,
  );
  if (req) {
    return req[1];
  }
  const positional = content.match(/@RequestMapping\s*\(\s*["']([^"']*)["']/);
  return positional?.[1] ?? "";
}

function extractMethodMappingPath(annotationTail) {
  const afterName = annotationTail.replace(/^@\w+/, "");
  if (!afterName.trimStart().startsWith("(")) {
    return "";
  }
  const parenStart = annotationTail.indexOf("(");
  let depth = 0;
  let parenEnd = parenStart;
  for (; parenEnd < annotationTail.length; parenEnd += 1) {
    const ch = annotationTail[parenEnd];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) {
    return null;
  }
  const inner = annotationTail.slice(parenStart + 1, parenEnd);
  const named = inner.match(/(?:value|path)\s*=\s*"([^"]*)"/);
  if (named) {
    return named[1];
  }
  const positional = inner.match(/^\s*"([^"]*)"/);
  if (positional) {
    return positional[1];
  }
  const positionalSingle = inner.match(/^\s*'([^']*)'/);
  if (positionalSingle) {
    return positionalSingle[1];
  }
  if (/^\s*$/.test(inner)) {
    return "";
  }
  return null;
}

function extractSpringMethodMappings(
  content,
  className,
  appCode,
  repo,
  database,
  baseUrlEnvKey,
  sourceFile,
  mappingName,
  method,
) {
  const endpoints = [];
  const classBase = extractClassBaseMapping(content);
  const re = new RegExp(`@${mappingName}\\b`, "g");
  let m;
  while ((m = re.exec(content))) {
    const lineStart = content.lastIndexOf("\n", m.index) + 1;
    const lineEnd = content.indexOf("\n", m.index);
    const line = content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd);
    const trimmedLine = line.trimStart();
    if (line.includes("import ") || trimmedLine.startsWith("//") || trimmedLine.startsWith("*")) {
      continue;
    }
    const afterMapping = content.slice(m.index + mappingName.length + 1).trimStart();
    if (afterMapping.startsWith(";")) {
      continue;
    }
    const subPath = extractMethodMappingPath(content.slice(m.index));
    if (subPath === null) {
      continue;
    }
    const pathStr = joinPaths(classBase, subPath);
    const after = content.slice(m.index, m.index + 600);
    const methodMatch = after.match(/public\s+[\w<>,\s\[\]]+\s+(\w+)\s*\(/);
    const methodName = methodMatch?.[1] ?? subPath.split("/").pop() ?? "unknown";
    const apiOp = after.match(/@ApiOperation\s*\(\s*(?:value\s*=\s*)?"([^"]*)"/);
    const readOnly = inferReadOnly(method, methodName, pathStr);
    const entity = inferEntity(`${className} ${methodName} ${pathStr} ${apiOp?.[1] ?? ""}`);
    const keywords = tokenizeForSearch(className, methodName, pathStr, apiOp?.[1], entity);
    endpoints.push({
      id: slugId([appCode, "http", method, pathStr, methodName]),
      appCode,
      repo,
      kind: "http",
      method,
      path: pathStr,
      className,
      methodName,
      summary: apiOp?.[1] ?? methodName,
      entity,
      readOnly,
      preferOverSql: readOnly && READ_KEYWORDS.test(`${methodName}${pathStr}`),
      keywords,
      sqlFallback: { database, table: "*", hint: "见 business-glossary / route_question" },
      baseUrlEnvKey,
      sourceFile: path.relative(BACKEND_ROOT, sourceFile),
    });
  }
  return endpoints;
}

function extractOptimusRest(content, className, appCode, repo, database, baseUrlEnvKey, sourceFile) {
  const endpoints = [];
  const re =
    /@Rest\s*\(\s*value\s*=\s*"([^"]*)"\s*,\s*method\s*=\s*OptimusRequestMethod\.(GET|POST|PUT|DELETE)/g;
  let m;
  while ((m = re.exec(content))) {
    const lineStart = content.lastIndexOf("\n", m.index) + 1;
    const lineEnd = content.indexOf("\n", m.index);
    const line = content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd).trimStart();
    if (line.startsWith("//") || line.startsWith("*")) {
      continue;
    }
    const pathStr = resolveOptimusRestPath(className, m[1], sourceFile);
    const method = m[2];
    const after = content.slice(m.index, m.index + 800);
    const methodMatch = after.match(
      /public\s+[\w<>,\s\[\]]+\s+(\w+)\s*\(/,
    );
    const methodName = methodMatch?.[1] ?? pathStr.split("/").pop() ?? "unknown";
    const apiOp = after.match(/@ApiOperation\s*\(\s*value\s*=\s*"([^"]*)"/);
    const readOnly = inferReadOnly(method, methodName, pathStr);
    const entity = inferEntity(`${className} ${methodName} ${pathStr} ${apiOp?.[1] ?? ""}`);
    const keywords = tokenizeForSearch(className, methodName, pathStr, apiOp?.[1], entity);
    endpoints.push({
      id: slugId([appCode, "http", method, pathStr, methodName]),
      appCode,
      repo,
      kind: "http",
      method,
      path: pathStr,
      className,
      methodName,
      summary: apiOp?.[1] ?? methodName,
      entity,
      readOnly,
      preferOverSql: readOnly && READ_KEYWORDS.test(`${methodName}${pathStr}`),
      keywords,
      sqlFallback: { database, table: "*", hint: "见 business-glossary / route_question" },
      baseUrlEnvKey,
      sourceFile: path.relative(BACKEND_ROOT, sourceFile),
    });
  }
  return endpoints;
}

function extractSpringMappings(content, className, appCode, repo, database, baseUrlEnvKey, sourceFile) {
  const endpoints = [];
  const mappingDefs = [
    { name: "GetMapping", method: "GET" },
    { name: "PostMapping", method: "POST" },
    { name: "PutMapping", method: "PUT" },
    { name: "DeleteMapping", method: "DELETE" },
    { name: "PatchMapping", method: "PATCH" },
  ];

  for (const { name, method } of mappingDefs) {
    endpoints.push(
      ...extractSpringMethodMappings(
        content,
        className,
        appCode,
        repo,
        database,
        baseUrlEnvKey,
        sourceFile,
        name,
        method,
      ),
    );
  }

  const classBase = extractClassBaseMapping(content);
  const reqRe =
    /@RequestMapping\s*\(\s*(?:value|path)\s*=\s*["']([^"']*)["']\s*,\s*method\s*=\s*RequestMethod\.(GET|POST|PUT|DELETE|PATCH)/g;
  let m;
  while ((m = reqRe.exec(content))) {
    const lineStart = content.lastIndexOf("\n", m.index) + 1;
    const lineEnd = content.indexOf("\n", m.index);
    const line = content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd).trimStart();
    if (line.startsWith("//") || line.startsWith("*")) {
      continue;
    }
    const method = m[2];
    const pathStr = joinPaths(classBase, m[1]);
    const after = content.slice(m.index, m.index + 600);
    const methodMatch = after.match(/public\s+[\w<>,\s\[\]]+\s+(\w+)\s*\(/);
    const methodName = methodMatch?.[1] ?? m[1].split("/").pop() ?? "unknown";
    const apiOp = after.match(/@ApiOperation\s*\(\s*(?:value\s*=\s*)?"([^"]*)"/);
    const readOnly = inferReadOnly(method, methodName, pathStr);
    const entity = inferEntity(`${className} ${methodName} ${pathStr} ${apiOp?.[1] ?? ""}`);
    const keywords = tokenizeForSearch(className, methodName, pathStr, apiOp?.[1], entity);
    endpoints.push({
      id: slugId([appCode, "http", method, pathStr, methodName]),
      appCode,
      repo,
      kind: "http",
      method,
      path: pathStr,
      className,
      methodName,
      summary: apiOp?.[1] ?? methodName,
      entity,
      readOnly,
      preferOverSql: readOnly && READ_KEYWORDS.test(`${methodName}${pathStr}`),
      keywords,
      sqlFallback: { database, table: "*", hint: "见 business-glossary / route_question" },
      baseUrlEnvKey,
      sourceFile: path.relative(BACKEND_ROOT, sourceFile),
    });
  }

  return endpoints;
}

function mergeCurated(endpoints, curated) {
  const byId = new Map(endpoints.map((e) => [e.id, e]));
  for (const item of curated.overrides ?? []) {
    const existing = byId.get(item.id);
    if (existing) {
      Object.assign(existing, item.patch);
      if (item.matchPatterns) existing.matchPatterns = item.matchPatterns;
      if (item.http) existing.http = { ...existing.http, ...item.http };
      if (item.dubbo) delete existing.dubbo;
      if (item.sqlFallback) existing.sqlFallback = item.sqlFallback;
    } else if (item.endpoint && item.endpoint.kind !== "dubbo") {
      endpoints.push(item.endpoint);
      byId.set(item.endpoint.id, item.endpoint);
    }
  }
  return endpoints;
}

function main() {
  if (!fs.existsSync(BACKEND_ROOT)) {
    console.error(`Backend root not found: ${BACKEND_ROOT}`);
    process.exit(1);
  }

  const registry = readJson(REGISTRY_FILE);
  const curated = fs.existsSync(CURATED_FILE)
    ? readJson(CURATED_FILE)
    : { overrides: [] };

  const allEndpoints = [];
  const appStats = {};

  for (const appDir of fs.readdirSync(BACKEND_ROOT)) {
    const appPath = path.join(BACKEND_ROOT, appDir);
    if (!fs.statSync(appPath).isDirectory()) continue;
    if (appDir.startsWith(".")) continue;

    const meta = registry.apps[appDir] ?? {
      repo: appDir,
      database: appDir.replace(/-/g, "_"),
      baseUrlEnvKey: `DFC_API_${appDir.replace(/-/g, "_").toUpperCase()}_BASE_URL`,
    };
    const appCode = appDir === "matador" ? "matador" : appDir;
    const { repo, database, baseUrlEnvKey } = meta;

    const javaFiles = walkJavaFiles(appPath);
    let httpCount = 0;

    for (const file of javaFiles) {
      const content = fs.readFileSync(file, "utf8");
      const className = path.basename(file, ".java");

      if (content.includes("@Rest(") || content.includes("@GetMapping") || content.includes("@PostMapping")) {
        const optimus = extractOptimusRest(content, className, appCode, repo, database, baseUrlEnvKey, file);
        const spring = extractSpringMappings(content, className, appCode, repo, database, baseUrlEnvKey, file);
        httpCount += optimus.length + spring.length;
        allEndpoints.push(...optimus, ...spring);
      }
    }

    if (httpCount > 0) {
      appStats[appCode] = { http: httpCount, repo };
    }
  }

  function isNoiseEndpoint(ep) {
    const source = String(ep.sourceFile ?? "").replaceAll("\\", "/");
    if (/(^|\/)([^/]*-)?(example|examples|demo|samples?|playground|mock)(\/|$)/i.test(source)) {
      return true;
    }
    if (/^(Example|Demo|Sample|Mock)/i.test(String(ep.className ?? ""))) {
      return true;
    }
    if (/\/dubbo\/\{classSimpleName\}\/\{methodName\}/i.test(String(ep.path ?? ""))) {
      return true;
    }
    return false;
  }

  // dedupe by id
  const deduped = [];
  const seen = new Set();
  for (const ep of allEndpoints) {
    if (isNoiseEndpoint(ep)) continue;
    if (seen.has(ep.id)) continue;
    seen.add(ep.id);
    deduped.push(ep);
  }

  const merged = mergeCurated(deduped, curated).filter((item) => item.kind === "http");

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceRoot: BACKEND_ROOT,
    stats: {
      total: merged.length,
      http: merged.length,
      readOnly: merged.filter((e) => e.readOnly).length,
      apps: appStats,
    },
    endpoints: merged,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  console.log(`Wrote ${merged.length} endpoints → ${OUT_FILE}`);
  console.log(JSON.stringify(payload.stats, null, 2));
}

main();

#!/usr/bin/env node
/**
 * 扫描本地 dafengche-backend 仓库，生成全量 HTTP / Dubbo 接口目录。
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
]);

const WRITE_KEYWORDS = /\b(save|update|delete|remove|create|insert|modify|batch|activate|cancel|submit|approve|reject|send|upload|import|export|sync|publish|bind|unbind|disable|enable|add|edit)\b/i;
const READ_KEYWORDS = /\b(get|query|find|search|list|page|detail|info|count|stat|load|fetch|select|lookup|check|exist|validate|preview|export\b.*\bquery)\b/i;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walkJavaFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
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

function extractClassBaseMapping(content) {
  const req = content.match(
    /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*)["']/,
  );
  return req?.[1] ?? "";
}

function extractOptimusRest(content, className, appCode, repo, database, baseUrlEnvKey, sourceFile) {
  const endpoints = [];
  const re =
    /@Rest\s*\(\s*value\s*=\s*"([^"]*)"\s*,\s*method\s*=\s*OptimusRequestMethod\.(GET|POST|PUT|DELETE)/g;
  let m;
  while ((m = re.exec(content))) {
    const pathStr = m[1].startsWith("/") ? m[1] : `/${m[1]}`;
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
  const classBase = extractClassBaseMapping(content);

  const patterns = [
    { re: /@GetMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*)["']/g, method: "GET" },
    { re: /@PostMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*)["']/g, method: "POST" },
    { re: /@PutMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*)["']/g, method: "PUT" },
    { re: /@DeleteMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*)["']/g, method: "DELETE" },
    { re: /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*)["']\s*,\s*method\s*=\s*RequestMethod\.(GET|POST|PUT|DELETE)/g, method: null },
  ];

  for (const { re, method: fixedMethod } of patterns) {
    let m;
    while ((m = re.exec(content))) {
      const method = fixedMethod ?? m[2];
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
  }
  return endpoints;
}

function extractDubboInterface(content, filePath, appCode, repo, database, baseUrlEnvKey) {
  const endpoints = [];
  const ifaceMatch = content.match(/public\s+interface\s+(\w+)/);
  if (!ifaceMatch) return endpoints;
  const interfaceName = ifaceMatch[1];
  if (!/(Remote|Dubbo|Service|Api|Facade|SPI)/.test(interfaceName)) return endpoints;

  const pkg = content.match(/^package\s+([\w.]+);/m)?.[1] ?? "";
  const fullInterface = pkg ? `${pkg}.${interfaceName}` : interfaceName;

  const methodRe = /([\w<>,\s\[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*;/g;
  let m;
  while ((m = methodRe.exec(content))) {
    const methodName = m[2];
    if (methodName === "equals" || methodName === "hashCode") continue;
    const params = m[3].trim();
    const entity = inferEntity(`${interfaceName} ${methodName} ${params}`);
    const keywords = tokenizeForSearch(interfaceName, methodName, params, entity);
    const readOnly = inferReadOnly("DUBBO", methodName, params);
    endpoints.push({
      id: slugId([appCode, "dubbo", fullInterface, methodName]),
      appCode,
      repo,
      kind: "dubbo",
      interfaceName: fullInterface,
      methodName,
      paramHints: params.slice(0, 200),
      summary: `${interfaceName}.${methodName}`,
      entity,
      readOnly,
      preferOverSql: readOnly && READ_KEYWORDS.test(methodName),
      keywords,
      sqlFallback: { database, table: "*", hint: "见 business-glossary / route_question" },
      baseUrlEnvKey,
      sourceFile: path.relative(BACKEND_ROOT, filePath),
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
      if (item.dubbo) existing.dubbo = { ...existing.dubbo, ...item.dubbo };
      if (item.sqlFallback) existing.sqlFallback = item.sqlFallback;
    } else if (item.endpoint) {
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
      baseUrlEnvKey: registry.defaultAppMeta.baseUrlEnvKey,
    };
    const appCode = appDir === "matador" ? "matador" : appDir;
    const { repo, database, baseUrlEnvKey } = meta;

    const javaFiles = walkJavaFiles(appPath);
    let httpCount = 0;
    let dubboCount = 0;

    for (const file of javaFiles) {
      const content = fs.readFileSync(file, "utf8");
      const className = path.basename(file, ".java");

      const isApiModule =
        /\/api\//.test(file.replace(/\\/g, "/")) ||
        interfaceNameLooksLikeApi(className, content);

      if (content.includes("@Rest(") || content.includes("@GetMapping") || content.includes("@PostMapping")) {
        const optimus = extractOptimusRest(content, className, appCode, repo, database, baseUrlEnvKey, file);
        const spring = extractSpringMappings(content, className, appCode, repo, database, baseUrlEnvKey, file);
        httpCount += optimus.length + spring.length;
        allEndpoints.push(...optimus, ...spring);
      }

      if (isApiModule && content.includes("interface ")) {
        const dubbo = extractDubboInterface(content, file, appCode, repo, database, baseUrlEnvKey);
        dubboCount += dubbo.length;
        allEndpoints.push(...dubbo);
      }
    }

    if (httpCount + dubboCount > 0) {
      appStats[appCode] = { http: httpCount, dubbo: dubboCount, repo };
    }
  }

  // dedupe by id
  const deduped = [];
  const seen = new Set();
  for (const ep of allEndpoints) {
    if (seen.has(ep.id)) continue;
    seen.add(ep.id);
    deduped.push(ep);
  }

  const merged = mergeCurated(deduped, curated);

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceRoot: BACKEND_ROOT,
    stats: {
      total: merged.length,
      http: merged.filter((e) => e.kind === "http").length,
      dubbo: merged.filter((e) => e.kind === "dubbo").length,
      readOnly: merged.filter((e) => e.readOnly).length,
      apps: appStats,
    },
    endpoints: merged,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  console.log(`Wrote ${merged.length} endpoints → ${OUT_FILE}`);
  console.log(JSON.stringify(payload.stats, null, 2));
}

function interfaceNameLooksLikeApi(className, content) {
  return (
    /(?:Remote|DubboService|Facade|Api|SPI)$/.test(className) &&
    content.includes("interface ")
  );
}

main();

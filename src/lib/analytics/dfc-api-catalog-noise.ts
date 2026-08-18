/** 扫描噪声：example / demo 控制器，不应进入 Agent 接口目录 */

const NOISE_PATH =
  /(^|\/)(example|examples|demo|samples?|playground|mock)(\/|$)/i;

/** 源码已注释掉 @GetMapping，线上 404，不应再探测 */
const RETIRED_HTTP_PATH =
  /\/IdleFishBackupApi\/(changeIdleFishAccount|verifyIdleFishyAccountAndSynchronizeCar)$/i;

/** Optimus 相对 @Rest 被扫成 /flow|component|agent/...（缺 /v1/{classApi}/ 前缀） */
const STALE_OPTIMUS_NESTED_RELATIVE_PREFIX = /^\/(?:flow|component|agent)\//;

/** danube-electronic-contract 旧目录误用 /v1/{Controller}/，实际为 package web 路径 */
const STALE_DANUBE_ELECTRONIC_CONTRACT_V1_CONTROLLER =
  /^\/v1\/[a-zA-Z][a-zA-Z0-9]*Controller\//;

/**
 * danube-plug-in-web 的大量 /v1/* Web Action 依赖 UserInfoHolder 登录态
 * （shopCode/orgId/accountId/sourceCode），Mars token 下无法稳定自动探测。
 * 这类接口应走前端会话或 SQL 回退，不应继续进入默认 HTTP 批探测集合。
 */
const STATEFUL_PLUGIN_WEB_V1_PATH = /^\/v1\//;

/** 合法的非 /v1/ 前缀（绝对 @Rest 或 Spring 映射，不应视为扫描噪声） */
const ALLOWED_NON_V1_CATALOG_PATH_PREFIXES = [
  "/callback/",
  "/static/",
  "/template/",
  "/api/",
  "/bot-wall/",
  "/article/",
  "/mini/",
  "/pc/",
  "/dy/",
  "/inc/",
  "/platFormSearch/",
  "/platFormSts/",
  "/independent/",
  "/ksMini/",
  "/ttMini/",
  "/radar/",
  "/domain/",
  "/car/",
  "/h5/",
  "/platform/",
  "/web/",
] as const;

function isAllowedNonV1CatalogPath(path: string) {
  if (path === "/action") {
    return true;
  }
  return ALLOWED_NON_V1_CATALOG_PATH_PREFIXES.some((prefix) =>
    path.startsWith(prefix),
  );
}

function looksLikeOptimusScanClass(className?: string) {
  if (!className) {
    return false;
  }
  return /(?:Controller|Api|Action)$/.test(className);
}

/** 旧版目录生成器把 Optimus 相对 @Rest 扫成裸路径，stable 上 Spring 404 */
export function isStaleOptimusRelativeCatalogPath(endpoint: {
  appCode?: string;
  className?: string;
  http?: { path?: string };
}) {
  const path = endpoint.http?.path ?? "";
  if (!path || path.startsWith("/v1/") || isAllowedNonV1CatalogPath(path)) {
    return false;
  }
  if (!looksLikeOptimusScanClass(endpoint.className)) {
    return false;
  }
  if (STALE_OPTIMUS_NESTED_RELATIVE_PREFIX.test(path)) {
    return true;
  }
  if (/^\/[a-z][a-zA-Z0-9]*$/.test(path)) {
    if (/Api$/.test(endpoint.className ?? "")) {
      return true;
    }
    if (endpoint.appCode === "danube-electronic-contract") {
      return true;
    }
  }
  return false;
}

export function inferredBaseUrlEnvKeyForAppCode(appCode: string) {
  const normalized = appCode.trim().replace(/-/g, "_").toUpperCase();
  return `DFC_API_${normalized}_BASE_URL`;
}

export function resolveEndpointBaseUrlEnvKey(
  appCode: string,
  current?: string,
) {
  if (current && current !== "DFC_API_GATEWAY_BASE_URL") {
    return current;
  }
  return inferredBaseUrlEnvKeyForAppCode(appCode);
}

export function isDfcApiCatalogNoiseSource(
  sourceFile?: string,
  className?: string,
) {
  if (sourceFile && NOISE_PATH.test(sourceFile.replaceAll("\\", "/"))) {
    return true;
  }
  if (className && /^(Example|Demo|Sample|Mock)/i.test(className)) {
    return true;
  }
  return false;
}

export function isDfcApiCatalogNoiseEndpoint(endpoint: {
  sourceFile?: string;
  className?: string;
  http?: { path?: string };
  appCode?: string;
}) {
  if (isDfcApiCatalogNoiseSource(endpoint.sourceFile, endpoint.className)) {
    return true;
  }
  const catalogPath = endpoint.http?.path ?? "";
  if (RETIRED_HTTP_PATH.test(catalogPath)) {
    return true;
  }
  if (isStaleOptimusRelativeCatalogPath(endpoint)) {
    return true;
  }
  if (
    endpoint.appCode === "danube-electronic-contract" &&
    STALE_DANUBE_ELECTRONIC_CONTRACT_V1_CONTROLLER.test(catalogPath)
  ) {
    return true;
  }
  if (
    endpoint.appCode === "ai-open-platform" &&
    /^\/web\/(echo|echos|header|cookie|json|array|map|others|template|body|jsonarray|file|path)/i.test(
      catalogPath,
    )
  ) {
    return true;
  }
  if (
    endpoint.appCode === "danube-plug-in-web" &&
    STATEFUL_PLUGIN_WEB_V1_PATH.test(catalogPath)
  ) {
    return true;
  }
  return false;
}

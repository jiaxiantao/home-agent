/** 扫描噪声：example / demo 控制器，不应进入 Agent 接口目录 */

const NOISE_PATH =
  /(^|\/)(example|examples|demo|samples?|playground|mock)(\/|$)/i;

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
  const path = endpoint.http?.path ?? "";
  if (
    endpoint.appCode === "ai-open-platform" &&
    /^\/web\/(echo|echos|header|cookie|json|array|map|others|template|body|jsonarray|file|path)/i.test(
      path,
    )
  ) {
    return true;
  }
  return false;
}

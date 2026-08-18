import fs from "node:fs";
import path from "node:path";

export type DfcApiTestHostsFile = {
  comment?: string;
  defaultTemplate: string;
  apps: Record<string, string>;
  /** Optimus @Rest 目录路径带 /v1 网关前缀；直连 app host 探测时需去掉 */
  stripGatewayV1Prefix?: string[];
  skipHttpProbe?: string[];
  skipHttpProbeEndpoints?: string[];
};

function defaultHostsPath() {
  return path.join(process.cwd(), "config/dfc-api-test-hosts.json");
}

let cached: DfcApiTestHostsFile | undefined;

export function loadDfcApiTestHosts(
  filePath = defaultHostsPath(),
): DfcApiTestHostsFile {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(filePath, "utf8")) as DfcApiTestHostsFile;
  }
  return cached;
}

/** 测试环境默认 host：优先 apps 例外，否则 {app}.stable.dasouche.net */
export function inferDefaultBaseUrlForApp(appCode: string): string {
  const hosts = loadDfcApiTestHosts();
  const hint = hosts.apps[appCode]?.trim();
  if (hint) {
    return hint.replace(/\/$/, "");
  }
  return hosts.defaultTemplate.replaceAll("{app}", appCode).replace(/\/$/, "");
}

export function shouldSkipHttpProbe(appCode: string): boolean {
  return (loadDfcApiTestHosts().skipHttpProbe ?? []).includes(appCode);
}

export function shouldSkipHttpProbeEndpoint(endpointId: string): boolean {
  return (loadDfcApiTestHosts().skipHttpProbeEndpoints ?? []).includes(endpointId);
}

export function shouldStripGatewayV1Prefix(appCode: string): boolean {
  return (loadDfcApiTestHosts().stripGatewayV1Prefix ?? []).includes(appCode);
}

function isGatewayBaseUrl(baseUrl: string): boolean {
  const gateway = process.env.DFC_API_GATEWAY_BASE_URL?.trim().replace(/\/$/, "");
  if (!gateway) {
    return false;
  }
  return baseUrl === gateway || baseUrl.startsWith(`${gateway}/`);
}

/** 直连 app host 时去掉 Optimus 网关 /v1 前缀；走 DFC_API_GATEWAY_BASE_URL 时保留 */
export function resolveDirectHttpPathForApp(
  appCode: string,
  path: string,
  baseUrl: string,
): string {
  if (!shouldStripGatewayV1Prefix(appCode) || isGatewayBaseUrl(baseUrl)) {
    return path;
  }
  if (path.startsWith("/v1/")) {
    return path.slice(3);
  }
  return path;
}

function rewriteRequestOrigin(requestUrl: string, origin: string): string | undefined {
  try {
    const next = new URL(requestUrl);
    const base = new URL(origin);
    next.protocol = base.protocol;
    next.hostname = base.hostname;
    next.port = base.port;
    const text = next.toString();
    return text === requestUrl ? undefined : text;
  } catch {
    return undefined;
  }
}

/**
 * 网关 503 / ECONNREFUSED 时换测试域名重试。
 * 顺序：.stable.dasouche.net → .dasouche-inc.net → 裸 .dasouche.net（http/https）。
 */
export function alternateTestRequestUrls(requestUrl: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return [];
  }

  const host = parsed.hostname.toLowerCase();
  const match = host.match(/^([a-z0-9-]+)(?:\.stable)?\.dasouche(?:-inc)?\.net$/);
  if (!match) {
    return [];
  }

  const app = match[1]!;
  const origins = [
    `https://${app}.stable.dasouche.net`,
    `http://${app}.stable.dasouche.net`,
    `https://${app}.dasouche-inc.net`,
    `http://${app}.dasouche-inc.net`,
    `https://${app}.dasouche.net`,
    `http://${app}.dasouche.net`,
  ];

  const out: string[] = [];
  for (const origin of origins) {
    const next = rewriteRequestOrigin(requestUrl, origin);
    if (next && !out.includes(next)) {
      out.push(next);
    }
  }
  return out.slice(0, 4);
}

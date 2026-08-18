import fs from "node:fs";
import path from "node:path";

export type DfcApiTestHostsFile = {
  comment?: string;
  defaultTemplate: string;
  apps: Record<string, string>;
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

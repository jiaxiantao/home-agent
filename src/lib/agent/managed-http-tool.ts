import type { ManagedAgentTool } from "@/lib/agent/managed-tools";
import {
  assertTestSafeUpstreamUrl,
  buildDfcUpstreamSsoHeaders,
} from "@/lib/analytics/backend-api-client";
import { getDevSsoCredentials } from "@/lib/security/sso-config";
import { getSsoRequestContext } from "@/lib/security/sso-context";

function substitute(template: string, args: Record<string, unknown>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = args[key];
    return value == null ? "" : String(value);
  });
}

/**
 * 占位符的值由模型决定。若 origin 段（scheme / host / port）里出现占位符，
 * 模型就能把请求指向任意主机——assertTestSafeUpstreamUrl 是单点兜底，不该是唯一防线。
 * 因此在替换之前就要求 origin 必须是模板里写死的常量。
 */
export function assertStaticUrlOrigin(urlTemplate: string): string | null {
  const originEnd = urlTemplate.indexOf("/", urlTemplate.indexOf("://") + 3);
  const origin = originEnd === -1 ? urlTemplate : urlTemplate.slice(0, originEnd);

  if (/\{\{\w+\}\}/.test(origin)) {
    return `自定义工具 URL 的协议与域名不允许使用占位符：${origin}`;
  }
  return null;
}

/** 占位符值不得越出当前路径段，防止 ../ 穿越或注入新的 query/fragment */
function sanitizeUrlPlaceholderValues(args: Record<string, unknown>) {
  const safe: Record<string, unknown> = { ...args };
  for (const [key, value] of Object.entries(safe)) {
    if (value == null) {
      continue;
    }
    safe[key] = encodeURIComponent(String(value));
  }
  return safe;
}

function substituteRecord(
  record: Record<string, unknown> | undefined,
  args: Record<string, unknown>,
) {
  if (!record) {
    return undefined;
  }
  return JSON.parse(substitute(JSON.stringify(record), args)) as Record<
    string,
    unknown
  >;
}

function inferWebSource(url: string) {
  try {
    const host = new URL(url).hostname;
    return /super-mario|kartrider|crazyracing|matador|danube/i.test(host);
  } catch {
    return false;
  }
}

export async function invokeManagedHttpTool(
  tool: ManagedAgentTool,
  args: Record<string, unknown>,
) {
  const http = tool.http;
  if (!http?.url?.trim()) {
    return { output: `自定义工具 ${tool.name} 未配置 HTTP URL` };
  }

  const method = http.method === "POST" ? "POST" : "GET";
  const urlTemplate = http.url.trim();

  const unsafeOrigin = assertStaticUrlOrigin(urlTemplate);
  if (unsafeOrigin) {
    return { output: unsafeOrigin, data: { status: "error", url: urlTemplate, method } };
  }

  let urlText = substitute(urlTemplate, sanitizeUrlPlaceholderValues(args));
  const query = substituteRecord(http.queryTemplate, args);
  if (query) {
    const url = new URL(urlText);
    for (const [key, value] of Object.entries(query)) {
      if (value == null || String(value).trim() === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
    urlText = url.toString();
  }

  const unsafe = assertTestSafeUpstreamUrl(urlText);
  if (unsafe) {
    return { output: unsafe };
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const extraHeaders = substituteRecord(http.headers, args);
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (/^(cookie|souche-security-token)$/i.test(key)) {
        continue;
      }
      headers[key] = String(value);
    }
  }

  const sso = getSsoRequestContext() ?? getDevSsoCredentials();
  if (sso) {
    Object.assign(headers, buildDfcUpstreamSsoHeaders(sso));
  }
  if (inferWebSource(urlText)) {
    headers._source_code = "WEB";
  }
  const serviceChain = process.env.DFC_API_SERVICE_CHAIN?.trim();
  if (serviceChain) {
    headers["X-Souche-ServiceChain"] = serviceChain;
  }

  const body = method === "POST" ? substituteRecord(http.bodyTemplate, args) : undefined;
  const timeoutMs = Number(process.env.DFC_API_TIMEOUT_MS ?? 12000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(urlText, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      redirect: "manual",
    });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // keep text
    }

    const preview =
      typeof payload === "string"
        ? payload.slice(0, 800)
        : JSON.stringify(payload).slice(0, 1200);

    return {
      output: [
        `自定义工具 ${tool.label} ${method} ${urlText}`,
        `HTTP ${response.status}`,
        preview,
      ].join("\n"),
      data: {
        status: response.ok ? "success" : "error",
        statusCode: response.status,
        url: urlText,
        method,
        response: payload,
      },
    };
  } catch (error) {
    return {
      output: `自定义工具 ${tool.name} 调用失败：${
        error instanceof Error ? error.message : String(error)
      }`,
      data: { status: "error", url: urlText, method },
    };
  } finally {
    clearTimeout(timer);
  }
}

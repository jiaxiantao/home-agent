import { getDevSsoCredentials } from "@/lib/security/sso-config";
import { getSsoRequestContext } from "@/lib/security/sso-context";
import { hashSsoToken } from "@/lib/security/sso-credentials";

import type { AgentToolResult } from "@/lib/agent/types";
import { callDfcMcpTool } from "@/lib/mcp/dfc-api/client";
import {
  assertDfcMcpPolicy,
  isDfcMcpEnabled,
  isDfcMcpFallbackLocal,
} from "@/lib/mcp/dfc-api/config";
import {
  dfcMcpCallHttpApi,
  dfcMcpRouteApi,
  dfcMcpSearchApis,
  formatDfcMcpCallOutput,
  formatDfcMcpRouteOutput,
  formatDfcMcpSearchOutput,
} from "@/lib/mcp/dfc-api/facade";
import type {
  DfcMcpCallHttpResult,
  DfcMcpRouteResult,
  DfcMcpSearchResult,
  DfcMcpSsoPayload,
  DfcMcpToolName,
} from "@/lib/mcp/dfc-api/types";

type ToolPayload = { output: string; data?: AgentToolResult["data"] };

function currentSsoPayload(): DfcMcpSsoPayload | undefined {
  const sso = getSsoRequestContext() ?? getDevSsoCredentials();
  if (!sso?.token?.trim()) return undefined;
  return {
    token: sso.token,
    tokenHeader: sso.tokenHeader,
    cookieHeader: sso.cookieHeader?.trim() || `_security_token=${sso.token}`,
    serviceChain: process.env.DFC_API_SERVICE_CHAIN?.trim() || undefined,
  };
}

async function viaMcpMiddleware<T>(
  toolName: DfcMcpToolName,
  mcpCall: () => Promise<T>,
  localCall: () => T | Promise<T>,
): Promise<{ result: T; via: "mcp" | "local_fallback" }> {
  assertDfcMcpPolicy();

  if (!isDfcMcpEnabled()) {
    const result = await localCall();
    return { result, via: "local_fallback" };
  }

  try {
    const result = await mcpCall();
    return { result, via: "mcp" };
  } catch (error) {
    if (!isDfcMcpFallbackLocal()) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `MCP 中间件调用失败（${toolName}），已禁止本地绕过：${message}`,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console -- MCP fallback notice
    console.warn(
      `[dfc-api-mcp] FALLBACK_LOCAL 绕过中间件 ${toolName}: ${message}`,
    );
    const result = await localCall();
    return { result, via: "local_fallback" };
  }
}

function withViaPrefix(via: "mcp" | "local_fallback", output: string) {
  const tag =
    via === "mcp"
      ? "[via MCP 中间件]"
      : "[via 本地门面·已绕过 MCP·仅排障]";
  return `${tag}\n${output}`;
}

export async function runRouteApiTool(args: {
  question: string;
  endpointId?: string;
}): Promise<ToolPayload> {
  const { result, via } = await viaMcpMiddleware(
    "dfc_route_api",
    () =>
      callDfcMcpTool<DfcMcpRouteResult>("dfc_route_api", {
        question: args.question,
        endpointId: args.endpointId,
      }),
    () => dfcMcpRouteApi(args),
  );

  return {
    output: withViaPrefix(via, formatDfcMcpRouteOutput(result)),
    data: { ...result, viaMcp: via === "mcp" },
  };
}

export async function runSearchApiTool(args: {
  keyword: string;
  appCode?: string;
  entity?: string;
  readOnlyOnly?: boolean;
  limit?: number;
}): Promise<ToolPayload> {
  const { result, via } = await viaMcpMiddleware(
    "dfc_search_apis",
    () =>
      callDfcMcpTool<DfcMcpSearchResult>("dfc_search_apis", {
        question: args.keyword,
        keyword: args.keyword,
        appCode: args.appCode,
        entity: args.entity,
        readOnlyOnly: args.readOnlyOnly,
        limit: args.limit,
      }),
    () =>
      dfcMcpSearchApis({
        question: args.keyword,
        appCode: args.appCode,
        entity: args.entity,
        readOnlyOnly: args.readOnlyOnly,
        limit: args.limit,
      }),
  );

  return {
    output: withViaPrefix(via, formatDfcMcpSearchOutput(result)),
    data: {
      keyword: result.keyword,
      appCode: result.appCode,
      entity: result.entity,
      readOnlyOnly: result.readOnlyOnly,
      matches: result.matches,
      viaMcp: via === "mcp",
    },
  };
}

export async function runCallBackendApiTool(args: {
  endpointId: string;
  question?: string;
  phone?: string;
  recordId?: string;
  shopCode?: string;
  objCode?: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<ToolPayload> {
  const sso = currentSsoPayload();
  if (!sso) {
    // eslint-disable-next-line no-console -- diagnose missing SSO
    console.warn(
      "[dfc-api-mcp] call_backend_api 缺少 SSO：ALS 与 DFC_API_DEV_SSO_TOKEN 均为空",
    );
  } else {
    // eslint-disable-next-line no-console -- diagnose SSO without leaking token
    console.error(
      `[dfc-api-mcp] call_backend_api ssoFp=${hashSsoToken(sso.token)}`,
    );
  }

  const payload = { ...args, sso, _sso: sso };

  const { result, via } = await viaMcpMiddleware(
    "dfc_call_http_api",
    () => callDfcMcpTool<DfcMcpCallHttpResult>("dfc_call_http_api", payload),
    () => dfcMcpCallHttpApi(payload),
  );

  const ssoHint = sso
    ? `SSO指纹=${hashSsoToken(sso.token)}`
    : "SSO=未注入（请检查 Cookie _security_token）";

  return {
    output: withViaPrefix(
      via,
      `${formatDfcMcpCallOutput(result.endpointId, result.appCode, result)}\n${ssoHint}`,
    ),
    data: {
      ...result,
      viaMcp: via === "mcp",
      ssoPresent: Boolean(sso),
    },
  };
}

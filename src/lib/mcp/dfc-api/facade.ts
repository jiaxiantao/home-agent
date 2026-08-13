import {
  extractApiParams,
  getDfcApiEndpointById,
  loadDfcApiCatalog,
  pickBestApiForQuestion,
  rankApisForQuestion,
  searchApis,
} from "@/lib/analytics/api-catalog";
import { getDfcApiCatalogStats } from "@/lib/analytics/api-catalog-store";
import {
  buildSuggestedSqlForEndpoint,
  callBackendApi,
} from "@/lib/analytics/backend-api-client";
import { getDevSsoCredentials, primaryHeaderForCookie } from "@/lib/security/sso-config";
import {
  getSsoRequestContext,
  runWithSsoRequestContext,
} from "@/lib/security/sso-context";
import type { SsoCredentials } from "@/lib/security/sso-credentials";

import { serializeEndpoint, serializeMatch } from "@/lib/mcp/dfc-api/serialize";
import type {
  DfcMcpCallHttpInput,
  DfcMcpCallHttpResult,
  DfcMcpGetResult,
  DfcMcpRouteInput,
  DfcMcpRouteResult,
  DfcMcpSearchInput,
  DfcMcpSearchResult,
  DfcMcpSsoPayload,
  DfcMcpStatsResult,
} from "@/lib/mcp/dfc-api/types";

function toSsoCredentials(payload?: DfcMcpSsoPayload): SsoCredentials | null {
  if (!payload?.token?.trim()) return null;
  const token = payload.token.trim();
  return {
    token,
    tokenHeader: payload.tokenHeader?.trim() || primaryHeaderForCookie("_security_token"),
    cookieHeader: payload.cookieHeader?.trim() || undefined,
  };
}

export function dfcMcpCatalogStats(): DfcMcpStatsResult {
  const catalog = loadDfcApiCatalog();
  return {
    stats: getDfcApiCatalogStats() ?? {},
    catalogSize: catalog.length,
  };
}

export function dfcMcpSearchApis(input: DfcMcpSearchInput): DfcMcpSearchResult {
  const keyword = (input.question ?? input.keyword ?? "").trim();
  const readOnlyOnly = input.readOnlyOnly !== false;
  const limit = input.limit ?? 15;
  // kind 过滤发生在打分之后，需多取一些候选以免被 HTTP 顶满
  const fetchLimit = input.kind ? Math.max(limit * 20, 200) : Math.max(limit * 3, limit);

  let matches = searchApis({
    question: keyword,
    appCode: input.appCode,
    entity: input.entity,
    readOnlyOnly,
    limit: fetchLimit,
  });

  if (input.kind) {
    matches = matches.filter((item) => item.endpoint.kind === input.kind);
  }

  matches = matches.slice(0, limit);

  return {
    keyword,
    appCode: input.appCode,
    entity: input.entity,
    kind: input.kind,
    readOnlyOnly,
    catalogSize: loadDfcApiCatalog().length,
    matches: matches.map(serializeMatch),
  };
}

export function dfcMcpRouteApi(input: DfcMcpRouteInput): DfcMcpRouteResult {
  const question = input.question.trim();
  const params = extractApiParams(question);
  const ranked = rankApisForQuestion(question, 5);
  const best =
    (input.endpointId
      ? ranked.find((item) => item.endpoint.id === input.endpointId)
      : undefined) ?? pickBestApiForQuestion(question);

  return {
    question,
    params,
    bestMatch: best ? serializeMatch(best) : null,
    candidates: ranked.map(serializeMatch),
  };
}

export function dfcMcpGetApi(endpointId: string): DfcMcpGetResult {
  const endpoint = getDfcApiEndpointById(endpointId.trim());
  return {
    endpoint: endpoint ? serializeEndpoint(endpoint) : null,
  };
}

export async function dfcMcpCallHttpApi(
  input: DfcMcpCallHttpInput,
): Promise<DfcMcpCallHttpResult> {
  const endpointId = input.endpointId.trim();
  const endpoint = getDfcApiEndpointById(endpointId);
  if (!endpoint) {
    return {
      status: "error",
      failureKind: "http",
      endpointId,
      appCode: "unknown",
      message: `未知 endpointId：${endpointId}`,
    };
  }

  if (endpoint.kind === "dubbo" || !endpoint.http) {
    const params = {
      phone: input.phone,
      recordId: input.recordId,
      shopCode: input.shopCode,
      objCode: input.objCode ?? "customer",
    };
    return {
      status: "skipped",
      failureKind: "skipped",
      endpointId: endpoint.id,
      appCode: endpoint.appCode,
      message:
        "第一期 MCP 中间件不支持 Dubbo 直连；请改用只读 HTTP 接口，或 propose_sql 使用 sqlFallback / suggestedSql。",
      sqlFallback: endpoint.sqlFallback,
      suggestedSql: buildSuggestedSqlForEndpoint(endpoint, params),
    };
  }

  const fromQuestion = extractApiParams(input.question || "");
  const params = {
    ...fromQuestion,
    phone: input.phone || fromQuestion.phone,
    recordId: input.recordId || fromQuestion.recordId,
    shopCode:
      input.shopCode ||
      fromQuestion.shopCode ||
      process.env.DFC_API_DEFAULT_SHOP_CODE?.trim() ||
      undefined,
    objCode: input.objCode || fromQuestion.objCode || "customer",
  };

  const ssoPayload = input.sso ?? input._sso;
  const sso =
    toSsoCredentials(ssoPayload) ??
    getSsoRequestContext() ??
    getDevSsoCredentials();
  const serviceChain =
    ssoPayload?.serviceChain?.trim() ||
    process.env.DFC_API_SERVICE_CHAIN?.trim();

  const run = () =>
    callBackendApi(endpoint, params, {
      extraQuery: input.query,
      extraBody: input.body,
      serviceChain,
    });

  if (!sso) {
    // callBackendApi 也会返回 auth，这里提前标明是中间件未拿到 SSO
    return withAuthMissing(endpoint, params);
  }

  return runWithSsoRequestContext(sso, run);
}

function withAuthMissing(
  endpoint: NonNullable<ReturnType<typeof getDfcApiEndpointById>>,
  params: {
    phone?: string;
    recordId?: string;
    shopCode?: string;
    objCode?: string;
  },
): DfcMcpCallHttpResult {
  return {
    status: "error",
    failureKind: "auth",
    endpointId: endpoint.id,
    appCode: endpoint.appCode,
    message:
      "MCP 中间件未收到 SSO（请求 Cookie / sso 参数均为空）。请确认侧栏已同步 _security_token，且 /api/agent 带 credentials。",
    sqlFallback: endpoint.sqlFallback,
    suggestedSql: buildSuggestedSqlForEndpoint(endpoint, params),
  };
}

export function formatDfcMcpSearchOutput(result: DfcMcpSearchResult): string {
  const lines = result.matches.map(
    (item) =>
      `- [${item.endpoint.id}] score=${item.score} ${item.endpoint.appCode} ${item.endpoint.title}（${item.endpoint.kind}）｜${item.httpCallable ? "可 HTTP" : "Dubbo/SQL"}｜${item.reasons.join("；")}`,
  );
  return [
    `接口搜索「${result.keyword}」全库 ${result.catalogSize} 条`,
    result.appCode ? `应用过滤：${result.appCode}` : "",
    result.entity ? `实体过滤：${result.entity}` : "",
    result.kind ? `类型过滤：${result.kind}` : "",
    `命中 ${result.matches.length} 条：`,
    lines.join("\n") || "- （无）",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDfcMcpRouteOutput(result: DfcMcpRouteResult): string {
  const lines = result.candidates.map(
    (item) =>
      `- [${item.endpoint.id}] score=${item.score} ${item.endpoint.title}（${item.endpoint.appCode}）｜${item.httpCallable ? "可 HTTP" : "Dubbo/SQL"}｜${item.reasons.join("；")}`,
  );
  return [
    `接口路由「${result.question}」`,
    `提取参数：${JSON.stringify(result.params)}`,
    result.bestMatch
      ? `推荐：${result.bestMatch.endpoint.id} — ${result.bestMatch.endpoint.title}（${result.bestMatch.httpCallable ? "尝试 call_backend_api" : "建议 SQL 回退"}）`
      : "未命中只读接口，请直接 route_question + propose_sql",
    "候选接口：",
    lines.join("\n") || "- （无）",
  ].join("\n");
}

export function formatDfcMcpCallOutput(
  endpointId: string,
  appCode: string,
  result: DfcMcpCallHttpResult,
): string {
  const tablePreview =
    result.table && result.table.rows.length > 0
      ? result.table.rows
          .slice(0, 3)
          .map((row) => JSON.stringify(row))
          .join("\n")
      : "";

  return [
    `后端接口 ${endpointId}（${appCode}）`,
    result.message,
    result.request ? `请求：${result.request.method} ${result.request.url}` : "",
    result.request?.query
      ? `已自动填充参数：${JSON.stringify(result.request.query)}`
      : "",
    tablePreview ? `结果预览：\n${tablePreview}` : "",
    result.suggestedSql
      ? `建议立即 propose_sql（勿向用户索参）：\n${result.suggestedSql}`
      : result.status !== "success" && result.sqlFallback
        ? `SQL 回退：\`${result.sqlFallback.database}.${result.sqlFallback.table}\` ${result.sqlFallback.hint}`
        : "",
  ]
    .filter(Boolean)
    .join("\n");
}

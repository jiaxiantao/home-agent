import {
  extractApiParams,
  getDfcApiEndpointById,
  loadDfcApiCatalog,
  pickBestApiForQuestion,
  rankApisForQuestion,
  searchApis,
} from "@/lib/analytics/api-catalog";
import { getDfcApiCatalogStats } from "@/lib/analytics/api-catalog-store";
import type { DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import {
  buildSuggestedSqlForEndpoint,
  callBackendApi,
} from "@/lib/analytics/backend-api-client";
import {
  enrichBackendApiCallResult,
  formatBackendApiCallGuidance,
  formatCallBackendApiHintForMatch,
} from "@/lib/agent/backend-api-tool-guide";
import { recordDfcApiAgentCall } from "@/lib/analytics/dfc-api-endpoints-mysql";
import { getDevSsoCredentials, primaryHeaderForCookie } from "@/lib/security/sso-config";
import {
  applyLoggedInUserToApiParams,
  applyLoggedInUserToBody,
  applyLoggedInUserToQuery,
  getCachedDfcUserProfile,
  resolveDfcUserProfileFromSso,
} from "@/lib/security/dfc-user-profile";
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

  matches = matches.filter((item) => item.endpoint.kind === "http");
  if (input.kind === "http") {
    // backward compatible no-op; catalog is HTTP-only
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
      message: `未知 endpointId：${endpointId}。请先 route_api / search_api 获取有效 endpointId，或执行 pnpm db:sync-apis 同步目录。`,
      nextAction: "search_api",
    };
  }

  void recordDfcApiAgentCall(endpoint.id).catch(() => {});

  if (!endpoint.http) {
    const params = {
      phone: input.phone,
      recordId: input.recordId,
      shopCode: input.shopCode,
      groupCode: input.groupCode,
      objCode: input.objCode ?? "customer",
      plate: input.plate,
    };
    return enrichCallResult(
      endpoint,
      {
        status: "skipped",
        failureKind: "skipped",
        endpointId: endpoint.id,
        appCode: endpoint.appCode,
        message:
          "该接口缺少 HTTP 定义，无法调用；请改用其它 HTTP 接口，或 propose_sql 使用 sqlFallback / suggestedSql。",
        sqlFallback: endpoint.sqlFallback,
        suggestedSql: buildSuggestedSqlForEndpoint(endpoint, params),
      },
    );
  }

  const fromQuestion = extractApiParams(input.question || "");
  const ssoPayload = input.sso ?? input._sso;
  const sso =
    toSsoCredentials(ssoPayload) ??
    getSsoRequestContext() ??
    getDevSsoCredentials();

  const loginUser = sso
    ? (getCachedDfcUserProfile(sso) ??
      (await resolveDfcUserProfileFromSso(sso)))
    : null;

  const params = applyLoggedInUserToApiParams(
    {
      ...fromQuestion,
      phone: input.phone || fromQuestion.phone,
      recordId: input.recordId || fromQuestion.recordId,
      plate: input.plate || fromQuestion.plate,
      shopCode: input.shopCode || fromQuestion.shopCode,
      groupCode: input.groupCode || fromQuestion.groupCode,
      orgCode: input.orgCode,
      departmentCode: input.departmentCode,
      objCode:
        input.objCode ||
        fromQuestion.objCode ||
        (fromQuestion.plate || input.plate ? "car" : "customer"),
    },
    loginUser,
  );
  if (!params.shopCode) {
    params.shopCode = process.env.DFC_API_DEFAULT_SHOP_CODE?.trim() || undefined;
  }

  const extraQuery = applyLoggedInUserToQuery(input.query, loginUser);
  const extraBody = applyLoggedInUserToBody(input.body, loginUser);
  const serviceChain =
    ssoPayload?.serviceChain?.trim() ||
    process.env.DFC_API_SERVICE_CHAIN?.trim();

  const run = () =>
    callBackendApi(endpoint, params, {
      extraQuery,
      extraBody,
      serviceChain,
    });

  if (!sso) {
    return enrichCallResult(endpoint, withAuthMissing(endpoint, params));
  }

  const raw = await runWithSsoRequestContext(sso, run);
  return enrichCallResult(endpoint, raw);
}

function enrichCallResult(
  endpoint: DfcApiEndpoint | undefined,
  result: DfcMcpCallHttpResult,
): DfcMcpCallHttpResult {
  return enrichBackendApiCallResult(result, { endpoint });
}

function withAuthMissing(
  endpoint: NonNullable<ReturnType<typeof getDfcApiEndpointById>>,
  params: {
    phone?: string;
    recordId?: string;
    shopCode?: string;
    objCode?: string;
    plate?: string;
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
      `- [${item.endpoint.id}] score=${item.score} ${item.endpoint.appCode} ${item.endpoint.title}（http）｜${item.httpCallable ? "可 HTTP" : "需 SQL"}｜${item.reasons.join("；")}`,
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
      `- [${item.endpoint.id}] score=${item.score} ${item.endpoint.title}（${item.endpoint.appCode}）｜${item.httpCallable ? "可 HTTP" : "需 SQL"}｜${item.reasons.join("；")}`,
  );
  const bestHint =
    result.bestMatch && result.bestMatch.httpCallable
      ? (() => {
          const ep = getDfcApiEndpointById(result.bestMatch!.endpoint.id);
          if (!ep) {
            return "";
          }
          return `\n${formatCallBackendApiHintForMatch(
            {
              endpoint: ep,
              score: result.bestMatch!.score,
              reasons: result.bestMatch!.reasons,
              extractedParams: result.bestMatch!.extractedParams,
              httpCallable: result.bestMatch!.httpCallable,
            },
            result.question,
          )}`;
        })()
      : "";
  return [
    `接口路由「${result.question}」`,
    `提取参数：${JSON.stringify(result.params)}`,
    result.bestMatch
      ? `推荐：${result.bestMatch.endpoint.id} — ${result.bestMatch.endpoint.title}（${result.bestMatch.httpCallable ? "尝试 call_backend_api" : "不可直接 HTTP，请 search_api 或换候选"}）`
      : "未命中只读 HTTP，请 search_api 再搜；仍无则 route_question + propose_sql",
    "候选接口：",
    lines.join("\n") || "- （无）",
    bestHint,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDfcMcpCallOutput(
  endpointId: string,
  appCode: string,
  result: DfcMcpCallHttpResult,
): string {
  const enriched = enrichBackendApiCallResult(result, {
    hasProposedSql: false,
  });
  const tablePreview =
    result.table && result.table.rows.length > 0
      ? result.table.rows
          .slice(0, 3)
          .map((row) => JSON.stringify(row))
          .join("\n")
      : "";

  return [
    `后端接口 ${endpointId}（${appCode}${enriched.endpointTitle ? ` · ${enriched.endpointTitle}` : ""}）`,
    result.message,
    result.request ? `请求：${result.request.method} ${result.request.url}` : "",
    result.request?.query
      ? `已自动填充参数：${JSON.stringify(result.request.query)}`
      : "",
    tablePreview ? `结果预览：\n${tablePreview}` : "",
    formatBackendApiCallGuidance(enriched),
    result.suggestedSql
      ? `建议立即 propose_sql（勿向用户索参）：\n${result.suggestedSql}`
      : result.status !== "success" && result.sqlFallback
        ? `SQL 回退：\`${result.sqlFallback.database}.${result.sqlFallback.table}\` ${result.sqlFallback.hint}`
        : "",
  ]
    .filter(Boolean)
    .join("\n");
}

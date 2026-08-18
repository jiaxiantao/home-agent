import type { ApiRouteMatch, ApiRouteParams, DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import type { BackendApiCallResult, BackendApiFailureKind } from "@/lib/analytics/backend-api-client";
import { isDfcApiEndpointEnvConfigured } from "@/lib/analytics/backend-api-client";
import type { AgentPlan, AgentToolResult } from "@/lib/agent/types";

export type BackendApiNextAction =
  | "done"
  | "call_backend_api"
  | "propose_sql"
  | "search_api"
  | "sync_sso"
  | "retry_other_endpoint";

export type EnrichedBackendApiCallResult = BackendApiCallResult & {
  nextAction: BackendApiNextAction;
  callHints?: string[];
  envConfigured?: boolean;
  endpointTitle?: string;
  remainingEndpointIds?: string[];
};

function hasTool(prior: AgentToolResult[], tool: AgentToolResult["tool"]) {
  return prior.some((item) => item.tool === tool);
}

/** 从问题/路由提取的参数是否满足接口 HTTP 模板 */
export function paramsSatisfyEndpoint(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
): boolean {
  if (!endpoint.http) {
    return false;
  }

  if (endpoint.http.queryParams) {
    const required = Object.values(endpoint.http.queryParams);
    if (required.length === 0) {
      return true;
    }
    if (required.every((key) => Boolean(params[key as keyof ApiRouteParams]))) {
      return true;
    }
    return required.some((key) => Boolean(params[key as keyof ApiRouteParams]));
  }

  if (endpoint.http.bodyTemplate) {
    const placeholders = [
      ...JSON.stringify(endpoint.http.bodyTemplate).matchAll(/\{\{(\w+)\}\}/g),
    ].map((match) => match[1]!);
    if (!placeholders.length) {
      return true;
    }
    if (placeholders.every((key) => Boolean(params[key as keyof ApiRouteParams]))) {
      return true;
    }
    return placeholders.some((key) => Boolean(params[key as keyof ApiRouteParams]));
  }

  return endpoint.http.method === "GET";
}

export function isEndpointHttpCallable(
  endpoint: DfcApiEndpoint,
  params: ApiRouteParams,
): boolean {
  if (!endpoint.readOnly || !endpoint.http) {
    return false;
  }
  return (
    endpoint.preferOverSql ||
    Boolean(endpoint.http.queryParams) ||
    Boolean(endpoint.http.bodyTemplate) ||
    paramsSatisfyEndpoint(endpoint, params)
  );
}

export function buildCallHints(endpoint: DfcApiEndpoint): string[] {
  const hints: string[] = [];
  if (endpoint.http?.queryParams) {
    for (const [queryKey, paramKey] of Object.entries(endpoint.http.queryParams)) {
      hints.push(`query.${queryKey} ← 工具参数 ${paramKey}（或 query 对象）`);
    }
  }
  if (endpoint.http?.bodyTemplate) {
    const placeholders = [
      ...JSON.stringify(endpoint.http.bodyTemplate).matchAll(/\{\{(\w+)\}\}/g),
    ].map((match) => match[1]!);
    if (placeholders.length) {
      hints.push(`body 模板占位符：${placeholders.join("、")}`);
    }
  }
  if (endpoint.methodName === "queryCustomerDetailsByContact") {
    hints.push("手机号/微信号传 phone（映射 contact）；禁止向用户索取 shop_code");
  }
  if (endpoint.methodName === "crmQueryCustomerInfo") {
    hints.push("客户 id 传 recordId；objCode 默认 customer");
  }
  if (endpoint.http?.path?.includes("queryRecordPageInfo")) {
    hints.push("车牌传 plate 或 body.keywords");
  }
  hints.push(`上游 env：${endpoint.baseUrlEnvKey}`);
  return hints;
}

export function buildCallBackendApiArgsFromMatch(
  match: Pick<ApiRouteMatch, "endpoint" | "extractedParams">,
  question: string,
  extras?: { phone?: string; plate?: string },
): Record<string, unknown> {
  const params = match.extractedParams ?? {};
  const args: Record<string, unknown> = {
    endpointId: match.endpoint.id,
    question,
    phone: params.phone ?? params.wechat ?? extras?.phone,
    recordId: params.recordId,
    shopCode: params.shopCode,
    groupCode: params.groupCode,
    objCode: params.objCode,
    plate: params.plate ?? extras?.plate,
  };

  if (match.endpoint.http?.path?.includes("queryRecordPageInfo") && args.plate) {
    args.body = { keywords: args.plate };
  }

  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => value != null && String(value).trim() !== ""),
  );
}

export function resolveBackendApiNextAction(
  result: BackendApiCallResult,
  options?: {
    remainingEndpointIds?: string[];
    hasProposedSql?: boolean;
  },
): BackendApiNextAction {
  if (result.status === "success") {
    return "done";
  }
  if (result.failureKind === "auth") {
    return "sync_sso";
  }
  if (result.suggestedSql && !options?.hasProposedSql) {
    return "propose_sql";
  }
  if (options?.remainingEndpointIds?.length) {
    return "retry_other_endpoint";
  }
  if (result.failureKind === "missing_params") {
    return "search_api";
  }
  if (result.sqlFallback && result.sqlFallback.database !== "*") {
    return "propose_sql";
  }
  return "retry_other_endpoint";
}

export function enrichBackendApiCallResult(
  result: BackendApiCallResult,
  context?: {
    endpoint?: DfcApiEndpoint;
    remainingEndpointIds?: string[];
    hasProposedSql?: boolean;
  },
): EnrichedBackendApiCallResult {
  const endpoint = context?.endpoint;
  return {
    ...result,
    endpointTitle: endpoint?.title,
    envConfigured: endpoint ? isDfcApiEndpointEnvConfigured(endpoint) : undefined,
    callHints: endpoint ? buildCallHints(endpoint) : undefined,
    remainingEndpointIds: context?.remainingEndpointIds,
    nextAction: resolveBackendApiNextAction(result, context),
  };
}

const NEXT_ACTION_LABEL: Record<BackendApiNextAction, string> = {
  done: "接口已成功，可汇总回答或继续调用其它 endpointId",
  call_backend_api: "仍有其它可 HTTP 候选，换 endpointId 再 call_backend_api",
  propose_sql: "立刻 propose_sql（使用 suggestedSql），禁止向用户索取 shop_code",
  search_api: "route 未命中，先 search_api 扩大检索",
  sync_sso: "提示用户侧栏同步大风车登录（_security_token）后重试",
  retry_other_endpoint: "换 route_api/search_api 候选 endpointId 重试，或 SQL 回退",
};

export function formatBackendApiNextActionLine(result: EnrichedBackendApiCallResult) {
  return `下一步（nextAction=${result.nextAction}）：${NEXT_ACTION_LABEL[result.nextAction]}`;
}

export function formatBackendApiCallGuidance(result: EnrichedBackendApiCallResult): string {
  const lines = [formatBackendApiNextActionLine(result)];
  if (result.callHints?.length) {
    lines.push(`调用提示：${result.callHints.join("；")}`);
  }
  if (result.envConfigured === false) {
    lines.push("上游 baseUrl 未配置：优先 propose_sql，勿向用户索参");
  }
  if (result.remainingEndpointIds?.length) {
    lines.push(`还可尝试：${result.remainingEndpointIds.slice(0, 3).join(" | ")}`);
  }
  return lines.join("\n");
}

export function formatCallBackendApiHintForMatch(match: ApiRouteMatch, question: string) {
  const args = buildCallBackendApiArgsFromMatch(match, question);
  const hints = buildCallHints(match.endpoint);
  return [
    `推荐 call_backend_api：${JSON.stringify(args)}`,
    ...hints.map((item) => `- ${item}`),
  ].join("\n");
}

export function mergeApiRouteCandidates(
  routed:
    | {
        bestMatch?: ApiRouteMatch | null;
        candidates?: ApiRouteMatch[];
      }
    | undefined,
  searched:
    | {
        matches?: ApiRouteMatch[];
      }
    | undefined,
): ApiRouteMatch[] {
  const list = [routed?.bestMatch, ...(routed?.candidates ?? []), ...(searched?.matches ?? [])];
  const seen = new Set<string>();
  const merged: ApiRouteMatch[] = [];
  for (const item of list) {
    if (!item?.endpoint?.id || seen.has(item.endpoint.id)) {
      continue;
    }
    seen.add(item.endpoint.id);
    merged.push(item);
  }
  return merged;
}

export function nextCallableApiMatch(
  matches: ApiRouteMatch[],
  called: Set<string>,
  params: ApiRouteParams,
) {
  for (const item of matches) {
    const id = item.endpoint.id;
    if (called.has(id)) {
      continue;
    }
    const callable = item.httpCallable || isEndpointHttpCallable(item.endpoint, {
      ...item.extractedParams,
      ...params,
    });
    if (!callable) {
      continue;
    }
    return item;
  }
  return undefined;
}

export function resolveApiFallbackPlan(
  question: string,
  prior: AgentToolResult[],
): AgentPlan | null {
  const last = prior.at(-1);
  if (last?.tool !== "call_backend_api" || !last.data || typeof last.data !== "object") {
    return null;
  }

  const data = last.data as EnrichedBackendApiCallResult;
  if (data.status === "success" || hasTool(prior, "propose_sql")) {
    return null;
  }

  if (data.nextAction === "propose_sql" && data.suggestedSql) {
    return {
      action: "tool",
      tool: "propose_sql",
      args: {
        sql: data.suggestedSql,
        explanation:
          data.failureKind === "auth"
            ? "HTTP 需大风车 SSO（侧栏同步登录）；参数已齐全，暂以 SQL 回退"
            : `HTTP 调用失败（${data.failureKind ?? data.status}），自动 SQL 回退`,
      },
      reasoning:
        "call_backend_api 返回 nextAction=propose_sql：立即 propose_sql，禁止向用户索取 shop_code",
    };
  }

  if (data.nextAction === "search_api" && !hasTool(prior, "search_api")) {
    return {
      action: "tool",
      tool: "search_api",
      args: { question, keyword: question, readOnlyOnly: true, limit: 12 },
      reasoning: "call_backend_api 缺参或未命中：扩大 search_api 检索其它 HTTP 候选",
    };
  }

  return null;
}

export function slimBackendApiDataForPlanner(data: Record<string, unknown>) {
  const keep: Record<string, unknown> = {
    status: data.status,
    failureKind: data.failureKind,
    endpointId: data.endpointId,
    appCode: data.appCode,
    message: data.message,
    suggestedSql: data.suggestedSql,
    nextAction: data.nextAction,
    envConfigured: data.envConfigured,
    endpointTitle: data.endpointTitle,
    remainingEndpointIds: data.remainingEndpointIds,
    sqlFallback: data.sqlFallback,
  };
  if (data.table && typeof data.table === "object") {
    const table = data.table as { columns?: unknown[]; rows?: unknown[] };
    keep.table = {
      columns: Array.isArray(table.columns) ? table.columns.slice(0, 12) : [],
      rowCount: Array.isArray(table.rows) ? table.rows.length : 0,
      rowsPreview: Array.isArray(table.rows) ? table.rows.slice(0, 3) : [],
    };
  }
  return keep;
}

export function failureKindHint(kind?: BackendApiFailureKind) {
  switch (kind) {
    case "auth":
      return "同步大风车登录后重试 HTTP";
    case "not_configured":
      return "检查 config/dfc-api.env 中对应 DFC_API_*_BASE_URL";
    case "missing_params":
      return "换 endpointId 或 search_api；勿向用户索取 shop_code";
    case "network":
      return "上游不可用，优先 propose_sql";
    default:
      return undefined;
  }
}

export function formatCallBackendApiReferenceForPrompt() {
  return [
    "- endpointId（必填）：来自 route_api / search_api 候选的 id 字段",
    "- question（推荐）：传入用户原问题，自动提取 phone/recordId/plate",
    "- phone：手机号或微信号（queryCustomerDetailsByContact → contact）",
    "- recordId：CRM 客户 id（crmQueryCustomerInfo）",
    "- plate：车牌（queryRecordPageInfo → body.keywords 或 query）",
    "- objCode：CRM 对象，默认 customer；查车时用 car",
    "- query / body：catalog 模板外的额外 HTTP 参数",
    "- shopCode / groupCode：由登录 SSO 自动注入，禁止向用户索取",
    "- 工具返回 data.nextAction：propose_sql | call_backend_api | search_api | sync_sso",
    "- 典型链路：route_api → call_backend_api（可多次换 endpointId）→ 组装回答；失败按 nextAction 回退",
  ].join("\n");
}

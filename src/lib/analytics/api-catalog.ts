/**
 * 大风车全量接口检索与路由（config/dfc-api-catalog.json，约 1 万条）。
 * 生成：pnpm generate:api-catalog
 */

import { matchBusinessEntities } from "@/lib/analytics/business-glossary";
import { extractLicensePlate } from "@/lib/analytics/question-router";
import type {
  ApiRouteMatch,
  ApiRouteParams,
  DfcApiEndpoint,
} from "@/lib/analytics/api-catalog-types";
import {
  getDfcApiCatalogStats,
  getDfcApiEndpointById,
  loadDfcApiCatalog,
} from "@/lib/analytics/api-catalog-store";

export type {
  ApiRouteMatch,
  ApiRouteParams,
  DfcApiEndpoint,
  DfcApiKind,
} from "@/lib/analytics/api-catalog-types";

/** @deprecated 使用 loadDfcApiCatalog()；保留兼容别名 */
export function getDfcApiCatalog() {
  return loadDfcApiCatalog();
}

export const dfcApiCatalog = new Proxy([] as DfcApiEndpoint[], {
  get(_target, prop) {
    const catalog = loadDfcApiCatalog();
    const value = Reflect.get(catalog, prop);
    return typeof value === "function" ? value.bind(catalog) : value;
  },
});

export function extractPhoneFromQuestion(question: string): string | undefined {
  const normalized = question.trim();
  const explicit =
    normalized.match(
      /(?:手机|电话|mobile|phone)\s*(?:号|号码)?\s*(?:为|是|=|：|:)?\s*['"`]?(\d{11})/i,
    ) ?? normalized.match(/\b(1[3-9]\d{9})\b/);
  return explicit?.[1];
}

/** 微信号：字母开头，6～20 位字母数字_- */
export function extractWechatFromQuestion(question: string): string | undefined {
  const explicit = question.match(
    /微信(?:号|账号|id)?\s*(?:为|是|=|：|:)?\s*['"`]?([a-zA-Z][-_a-zA-Z0-9]{5,19})/i,
  );
  return explicit?.[1];
}

export function extractApiParams(question: string): ApiRouteParams {
  const phone = extractPhoneFromQuestion(question);
  const wechat = extractWechatFromQuestion(question);
  const plate = extractLicensePlate(question);
  const recordId =
    question.match(
      /(?:客户|record)\s*(?:id|ID|Id)\s*(?:为|是|=|：|:)\s*['"`]?([a-zA-Z0-9_-]{2,64})/i,
    )?.[1] ??
    question.match(/\brecordId\s*=\s*['"`]?([a-zA-Z0-9_-]+)/i)?.[1];

  const isCrmQuestion = /客户|CRM|跟进|门店客户/.test(question);
  return {
    phone: phone || wechat,
    wechat,
    plate,
    recordId,
    objCode: isCrmQuestion
      ? process.env.DFC_API_DEFAULT_CUSTOMER_OBJ_CODE?.trim() || "customer"
      : undefined,
  };
}

function tokenizeQuestion(question: string): string[] {
  const tokens = new Set<string>();
  const normalized = question.toLowerCase();
  for (const part of normalized.split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (part.length >= 2) tokens.add(part);
  }
  for (const en of normalized.match(/[a-z][a-z0-9_]*/g) ?? []) {
    if (en.length >= 3) tokens.add(en);
  }
  return [...tokens];
}

function inferEntityFilters(question: string): string[] | null {
  const entities = new Set<string>();
  for (const hit of matchBusinessEntities(question)) {
    if (hit.table === "customer") entities.add("crm_customer");
    if (hit.table === "cheniu_user") entities.add("cheniu_user");
    if (hit.table.includes("member")) entities.add("member");
    if (hit.table === "car") entities.add("car");
    if (hit.table.includes("order")) entities.add("order");
  }
  if (/客户|CRM|跟进|门店客户/.test(question)) entities.add("crm_customer");
  if (/车牛用户|dfc_user|cheniu/.test(question)) entities.add("cheniu_user");
  if (/会员|vip/i.test(question)) entities.add("member");
  if (/车牌|车辆信息|车源|库存车|在售|kartrider/.test(question)) entities.add("car");
  if (/订单|成交/.test(question)) entities.add("order");
  if (/合同/.test(question)) entities.add("contract");
  if (/线索/.test(question)) entities.add("lead");
  if (/车型|vin/i.test(question)) entities.add("car_model");
  return entities.size > 0 ? [...entities] : null;
}

function scoreEndpoint(
  endpoint: DfcApiEndpoint,
  question: string,
  questionTokens: string[],
  params: ApiRouteParams,
  entityFilters: string[] | null,
): ApiRouteMatch | null {
  const reasons: string[] = [];
  let score = 0;

  if (entityFilters && entityFilters.includes(endpoint.entity)) {
    score += 4;
    reasons.push(`实体：${endpoint.entity}`);
  }

  for (const pattern of endpoint.matchPatterns) {
    if (pattern.test(question)) {
      score += 8;
      reasons.push("curated 语义匹配");
    }
  }

  const blob = `${endpoint.methodName ?? ""} ${endpoint.http?.path ?? ""} ${endpoint.title} ${endpoint.keywords.join(" ")}`.toLowerCase();
  for (const token of questionTokens) {
    if (token.length < 2) continue;
    if (blob.includes(token)) {
      score += token.length >= 4 ? 2 : 1;
    }
    if (endpoint.keywords.includes(token)) {
      score += 2;
    }
  }

  if (params.phone || params.wechat) {
    if (/phone|mobile|contact|weichat|wechat|手机|电话|微信/i.test(blob)) {
      score += 5;
      reasons.push(params.wechat && !extractPhoneFromQuestion(question)
        ? "微信号 + 接口含 contact/weichat"
        : "手机号 + 接口含 phone/contact");
    }
    if (endpoint.http?.queryParams?.phone === "phone") score += 6;
    if (endpoint.http?.queryParams?.contact === "phone") score += 8;
  } else if (
    endpoint.http?.queryParams?.phone === "phone" ||
    endpoint.http?.queryParams?.contact === "phone"
  ) {
    score -= 10;
    reasons.push("需要手机号/微信号但问题未提供");
  }

  if (params.plate) {
    if (/plate|车牌|queryrecordpageinfo|kartrider|keywords/i.test(blob)) {
      score += 8;
      reasons.push("车牌号 + 车辆列表/详情接口");
    }
    if (
      endpoint.http?.bodyTemplate &&
      "keywords" in (endpoint.http.bodyTemplate as Record<string, unknown>)
    ) {
      score += 10;
      reasons.push("body keywords 可传车牌");
    }
  }

  if (params.recordId) {
    if (endpoint.http?.queryParams?.recordId === "recordId") {
      score += 12;
      reasons.push("recordId 参数匹配");
    }
    if (/recordid|queryrecorddetail|crmquerycustomer|customerdetail/i.test(blob)) {
      score += 8;
      reasons.push("客户 recordId 详情接口");
    }
    if (/record|customer|客户|id/i.test(blob)) {
      score += 4;
    }
  }

  if (endpoint.readOnly) score += 1;
  if (endpoint.preferOverSql) score += 2;
  if (endpoint.kind === "http" && endpoint.http) score += 1;
  if (!endpoint.readOnly) score -= 6;

  if (reasons.length === 0 && score < 10) return null;
  if (score <= 0) return null;

  const httpCallable =
    endpoint.kind === "http" &&
    endpoint.readOnly &&
    Boolean(endpoint.http) &&
    (endpoint.preferOverSql ||
      Boolean(endpoint.http?.queryParams) ||
      Boolean(endpoint.http?.bodyTemplate));

  if (endpoint.dubbo && !endpoint.http) {
    reasons.push("Dubbo-only");
  }

  return {
    endpoint,
    score,
    reasons,
    extractedParams: params,
    httpCallable,
  };
}

function candidatePool(question: string, entityFilters: string[] | null): DfcApiEndpoint[] {
  const catalog = loadDfcApiCatalog();
  if (entityFilters) {
    const filtered = catalog.filter((ep) => entityFilters.includes(ep.entity));
    if (filtered.length > 0) return filtered;
  }
  return catalog;
}

export function searchApis(options: {
  question?: string;
  keyword?: string;
  appCode?: string;
  entity?: string;
  readOnlyOnly?: boolean;
  limit?: number;
}): ApiRouteMatch[] {
  const question = (options.question ?? options.keyword ?? "").trim();
  if (!question) return [];

  const params = extractApiParams(question);
  const tokens = tokenizeQuestion(question);
  const entityFilters = options.entity
    ? [options.entity]
    : inferEntityFilters(question);

  let pool = candidatePool(question, entityFilters);
  if (options.appCode) {
    pool = pool.filter((ep) => ep.appCode === options.appCode);
  }
  if (options.readOnlyOnly) {
    pool = pool.filter((ep) => ep.readOnly);
  }

  const matches: ApiRouteMatch[] = [];
  for (const endpoint of pool) {
    const hit = scoreEndpoint(endpoint, question, tokens, params, entityFilters);
    if (hit) matches.push(hit);
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20);
}

export function rankApisForQuestion(question: string, limit = 10): ApiRouteMatch[] {
  return searchApis({ question, limit });
}

export function pickBestApiForQuestion(question: string): ApiRouteMatch | undefined {
  const ranked = rankApisForQuestion(question, 8);
  if (ranked.length === 0) return undefined;

  const params = extractApiParams(question);
  const top = ranked[0];
  if (!top || top.score < 8) return undefined;

  if (params.plate || /车牌|牌照|license.?number|license.?plate/i.test(question)) {
    const plateHit = ranked.find(
      (item) =>
        item.endpoint.methodName === "queryRecordPageInfo" ||
        item.endpoint.http?.path?.includes("queryRecordPageInfo") ||
        item.reasons.some((reason) => reason.includes("curated") || reason.includes("车牌")) ||
        /plate|license|车牌/i.test(
          `${item.endpoint.title} ${item.endpoint.keywords.join(" ")} ${item.endpoint.http?.path ?? ""}`,
        ),
    );
    if (plateHit && plateHit.score >= 8) return plateHit;
    if (!paramsHasPhone(params)) return undefined;
  }

  if (params.recordId) {
    const crmInfo = ranked.find(
      (item) =>
        item.endpoint.methodName === "crmQueryCustomerInfo" ||
        item.endpoint.http?.path?.includes("crmQueryCustomerInfo"),
    );
    if (crmInfo) return crmInfo;

    const byRecordId = ranked.find(
      (item) => item.endpoint.http?.queryParams?.recordId === "recordId",
    );
    if (byRecordId) return byRecordId;
  }

  if (
    /客户/.test(question) &&
    (paramsHasPhone(top.extractedParams) || top.extractedParams.wechat)
  ) {
    const byContact = ranked.find(
      (item) => item.endpoint.methodName === "queryCustomerDetailsByContact",
    );
    if (byContact) return byContact;
    const crm = ranked.find((item) => item.endpoint.entity === "crm_customer");
    if (crm && crm.score >= top.score - 2) return crm;
  }
  if (/车牛用户|用户信息/.test(question)) {
    const user = ranked.find((item) => item.endpoint.entity === "cheniu_user");
    if (user && user.score >= top.score - 2) return user;
  }

  return top;
}

function paramsHasPhone(params: ApiRouteParams) {
  return Boolean(params.phone || params.wechat);
}

/**
 * 高置信「明细 lookup」：车牌 / 客户 id / 手机微信等，catalog 已能直接 call HTTP。
 * 规划器对所有业务问数（含聚合）都会先 route_api；本函数不表示「聚合可以跳过接口」。
 */
export function isApiFirstQuestion(question: string): boolean {
  const params = extractApiParams(question);
  const best = pickBestApiForQuestion(question);
  if (!best) return false;
  if (params.plate && best.httpCallable) {
    return true;
  }
  if (best.endpoint.entity === "car" || best.endpoint.entity === "order") {
    return /手机|电话|微信|id\s*为|详情|信息/.test(question) && paramsHasPhone(params);
  }
  if (params.recordId && best.endpoint.http?.queryParams?.recordId === "recordId") {
    return true;
  }
  if (!best.endpoint.preferOverSql && !best.endpoint.http?.queryParams) {
    return paramsHasPhone(params) && best.score >= 8;
  }
  return paramsHasPhone(params);
}

export function formatApiCatalogForPrompt(question?: string) {
  const stats = getDfcApiCatalogStats();
  const total = (stats?.total as number | undefined) ?? loadDfcApiCatalog().length;

  if (question) {
    const matches = rankApisForQuestion(question, 5);
    if (matches.length > 0) {
      const header = `全库 ${total} 条接口，与当前问题相关 Top ${matches.length}：`;
      const lines = matches.map((item) => formatEndpointLine(item));
      return `${header}\n${lines.join("\n")}`;
    }
  }

  const prefer = loadDfcApiCatalog()
    .filter((ep) => ep.preferOverSql && ep.readOnly)
    .slice(0, 6)
    .map((ep) => {
      const call =
        ep.kind === "http" && ep.http
          ? `${ep.http.method} ${ep.http.path}`
          : `Dubbo ${ep.dubbo?.method}`;
      return `- ${ep.appCode} / ${ep.title}：${call}`;
    });

  return `全库 ${total} 条 HTTP+Dubbo 接口（config/dfc-api-catalog.json）。明细与聚合均请先 route_api / search_api；能调 HTTP 就调，多接口组装后再答，无合适接口才 SQL。\n${prefer.join("\n")}`;
}

function formatEndpointLine(item: ApiRouteMatch) {
  const ep = item.endpoint;
  const call =
    ep.kind === "http" && ep.http
      ? `${ep.http.method} ${ep.http.path}`
      : `Dubbo ${ep.dubbo?.interfaceName}.${ep.dubbo?.method}`;
  return `- [${ep.id}] score=${item.score} ${ep.appCode} ${ep.title} → ${call}｜${item.httpCallable ? "可 HTTP" : "Dubbo/SQL"}`;
}

export function formatApiRouteHintForPrompt(question?: string) {
  if (!question) {
    return "（传入问题后可显示接口路由建议）";
  }
  const best = pickBestApiForQuestion(question);
  if (!best) {
    return `已在全量接口库（${loadDfcApiCatalog().length} 条）中检索，未命中高置信只读接口；请 search_api 再搜一轮，仍无可用 HTTP 再 route_question + SQL。`;
  }
  const ep = best.endpoint;
  const call =
    ep.http?.method && ep.http.path
      ? `${ep.http.method} ${ep.http.path}`
      : `Dubbo ${ep.dubbo?.method}`;
  return [
    `推荐：${ep.title}（${ep.id}，score=${best.score}）`,
    `调用：${call}`,
    `参数：${JSON.stringify(best.extractedParams)}`,
    best.httpCallable
      ? "→ call_backend_api；若问题还需其它数据，继续调用其它候选接口后组装；都失败才 SQL"
      : "→ Dubbo/未映射 HTTP：先 search_api 找 HTTP 等价，没有再 SQL",
  ].join("\n");
}

export { getDfcApiEndpointById, getDfcApiCatalogStats, loadDfcApiCatalog };

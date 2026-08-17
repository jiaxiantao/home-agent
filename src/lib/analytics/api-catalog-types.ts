/**
 * 大风车后端接口目录类型（全量 catalog 由 scripts/generate-dfc-api-catalog.mjs 生成）。
 */

import type { HttpMethod } from "@/lib/analytics/http-methods";

export type { HttpMethod };

export type DfcApiKind = "http" | "dubbo";

export type DfcApiEndpoint = {
  id: string;
  appCode: string;
  repo: string;
  entity: string;
  title: string;
  description: string;
  /** 人工 / curated 正则；生成条目可为空，靠 keywords 检索 */
  matchPatterns: RegExp[];
  kind: DfcApiKind;
  readOnly: boolean;
  preferOverSql: boolean;
  http?: {
    method: HttpMethod;
    path: string;
    queryParams?: Record<string, string>;
    bodyTemplate?: Record<string, unknown>;
  };
  dubbo?: {
    interfaceName: string;
    method: string;
    paramHints: string;
  };
  keywords: string[];
  methodName?: string;
  className?: string;
  sqlFallback: {
    database: string;
    table: string;
    hint: string;
  };
  baseUrlEnvKey: string;
  sourceFile?: string;
};

export type ApiRouteParams = {
  phone?: string;
  /** 微信号；queryCustomerDetailsByContact 的 contact 也可传微信 */
  wechat?: string;
  recordId?: string;
  shopCode?: string;
  groupCode?: string;
  orgCode?: string;
  departmentCode?: string;
  /** super-mario CRM 对象 code，默认 customer */
  objCode?: string;
  /** 车牌号；车辆管理 queryRecordPageInfo keywords */
  plate?: string;
};

export type ApiRouteMatch = {
  endpoint: DfcApiEndpoint;
  score: number;
  reasons: string[];
  extractedParams: ApiRouteParams;
  httpCallable: boolean;
};

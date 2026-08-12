/**
 * 大风车后端接口目录类型（全量 catalog 由 scripts/generate-dfc-api-catalog.mjs 生成）。
 */

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
    method: "GET" | "POST";
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
  recordId?: string;
  shopCode?: string;
  /** super-mario CRM 对象 code，默认 customer */
  objCode?: string;
};

export type ApiRouteMatch = {
  endpoint: DfcApiEndpoint;
  score: number;
  reasons: string[];
  extractedParams: ApiRouteParams;
  httpCallable: boolean;
};

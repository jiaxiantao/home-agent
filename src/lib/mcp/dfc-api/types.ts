import type {
  ApiRouteMatch,
  ApiRouteParams,
  DfcApiEndpoint,
  DfcApiKind,
} from "@/lib/analytics/api-catalog-types";
import type { BackendApiCallResult } from "@/lib/analytics/backend-api-client";

/** MCP / 进程间透传的 SSO（stdio 子进程拿不到 ALS） */
export type DfcMcpSsoPayload = {
  token: string;
  tokenHeader?: string;
  cookieHeader?: string;
  serviceChain?: string;
};

export type DfcMcpSerializedEndpoint = Omit<DfcApiEndpoint, "matchPatterns"> & {
  matchPatterns: string[];
};

export type DfcMcpSerializedMatch = Omit<ApiRouteMatch, "endpoint"> & {
  endpoint: DfcMcpSerializedEndpoint;
};

export type DfcMcpSearchInput = {
  question?: string;
  keyword?: string;
  appCode?: string;
  entity?: string;
  kind?: DfcApiKind;
  readOnlyOnly?: boolean;
  limit?: number;
};

export type DfcMcpRouteInput = {
  question: string;
  endpointId?: string;
};

export type DfcMcpCallHttpInput = {
  endpointId: string;
  question?: string;
  phone?: string;
  recordId?: string;
  shopCode?: string;
  objCode?: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  _sso?: DfcMcpSsoPayload;
  /** 推荐字段名（避免部分传输层丢掉下划线前缀） */
  sso?: DfcMcpSsoPayload;
};

export type DfcMcpSearchResult = {
  keyword: string;
  appCode?: string;
  entity?: string;
  kind?: DfcApiKind;
  readOnlyOnly: boolean;
  catalogSize: number;
  matches: DfcMcpSerializedMatch[];
};

export type DfcMcpRouteResult = {
  question: string;
  params: ApiRouteParams;
  bestMatch: DfcMcpSerializedMatch | null;
  candidates: DfcMcpSerializedMatch[];
};

export type DfcMcpGetResult = {
  endpoint: DfcMcpSerializedEndpoint | null;
};

export type DfcMcpStatsResult = {
  stats: Record<string, unknown>;
  catalogSize: number;
};

export type DfcMcpCallHttpResult = BackendApiCallResult;

export const DFC_MCP_TOOL_NAMES = [
  "dfc_search_apis",
  "dfc_route_api",
  "dfc_get_api",
  "dfc_call_http_api",
  "dfc_catalog_stats",
] as const;

export type DfcMcpToolName = (typeof DFC_MCP_TOOL_NAMES)[number];

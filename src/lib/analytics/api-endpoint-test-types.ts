import type { ApiRouteParams } from "@/lib/analytics/api-catalog-types";

/** 客户端可安全 import：不含 node:fs / mysql / SSO 等服务端依赖 */

export type DfcApiTestRequestPreview = {
  kind: "http" | "dubbo";
  method?: string;
  url?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  dubbo?: {
    interfaceName: string;
    method: string;
    params: ApiRouteParams;
  };
  envConfigured: boolean;
  baseUrlEnvKey: string;
};

export type DfcApiTestResult = {
  endpointId: string;
  title: string;
  kind: "http" | "dubbo";
  ok: boolean;
  durationMs: number;
  status: string;
  message: string;
  warning?: string;
  envConfigured?: boolean;
  request?: DfcApiTestRequestPreview;
  response?: {
    httpStatus?: number;
    headers?: Record<string, string>;
    body?: unknown;
  };
};

export function isDfcApiProbeSkipped(result: Pick<DfcApiTestResult, "ok" | "status">) {
  return result.status === "skipped";
}

export function isDfcApiProbeFailed(result: Pick<DfcApiTestResult, "ok" | "status">) {
  return !result.ok && !isDfcApiProbeSkipped(result);
}

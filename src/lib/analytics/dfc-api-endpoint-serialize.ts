import type {
  ApiRouteParams,
  DfcApiEndpoint,
  DfcApiKind,
} from "@/lib/analytics/api-catalog-types";
import type { DfcApiTestConfig } from "@/lib/analytics/dfc-api-test-config";

export type StoredDfcApiEndpoint = {
  id: string;
  appCode: string;
  kind: DfcApiKind;
  title: string;
  description: string;
  readOnly: boolean;
  baseUrlEnvKey: string;
  endpoint: DfcApiEndpoint;
  defaultTestParams: ApiRouteParams;
  defaultTestConfig: DfcApiTestConfig;
  seeded: boolean;
  enabled: boolean;
  agentCallCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

type SerializedEndpoint = Omit<DfcApiEndpoint, "matchPatterns"> & {
  matchPatterns: string[];
};

export function serializeDfcApiEndpoint(endpoint: DfcApiEndpoint): SerializedEndpoint {
  return {
    ...endpoint,
    matchPatterns: endpoint.matchPatterns.map((item) => item.source),
  };
}

export function deserializeDfcApiEndpoint(raw: SerializedEndpoint): DfcApiEndpoint {
  return {
    ...raw,
    matchPatterns: (raw.matchPatterns ?? []).map((pattern) => new RegExp(pattern, "i")),
  };
}

export function parseStoredEndpointJson(value: unknown): DfcApiEndpoint {
  if (!value || typeof value !== "object") {
    throw new Error("endpoint_json 无效");
  }
  return deserializeDfcApiEndpoint(value as SerializedEndpoint);
}

export function parseDefaultTestParams(value: unknown): ApiRouteParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as ApiRouteParams;
}

export function toListItem(record: StoredDfcApiEndpoint) {
  const endpoint = record.endpoint;
  return {
    id: record.id,
    appCode: record.appCode,
    kind: record.kind,
    title: record.title,
    description: record.description,
    readOnly: record.readOnly,
    httpPath: endpoint.http?.path,
    httpMethod: endpoint.http?.method,
    dubboInterface: endpoint.dubbo?.interfaceName,
    dubboMethod: endpoint.dubbo?.method,
    baseUrlEnvKey: record.baseUrlEnvKey,
    defaultTestParams: record.defaultTestParams,
    defaultTestConfig: record.defaultTestConfig,
    seeded: record.seeded,
    enabled: record.enabled,
    agentCallCount: record.agentCallCount,
    updatedAt: record.updatedAt,
  };
}

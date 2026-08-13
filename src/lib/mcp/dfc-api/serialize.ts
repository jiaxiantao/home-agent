import type { ApiRouteMatch, DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import type { DfcMcpSerializedEndpoint, DfcMcpSerializedMatch } from "@/lib/mcp/dfc-api/types";

export function serializeEndpoint(endpoint: DfcApiEndpoint): DfcMcpSerializedEndpoint {
  return {
    ...endpoint,
    matchPatterns: endpoint.matchPatterns.map((pattern) => pattern.source),
  };
}

export function serializeMatch(match: ApiRouteMatch): DfcMcpSerializedMatch {
  return {
    ...match,
    endpoint: serializeEndpoint(match.endpoint),
  };
}

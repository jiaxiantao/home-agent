import type { ApiRouteParams, DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";

const SAMPLE_VALUES: Record<keyof ApiRouteParams, string> = {
  phone: "16612341112",
  wechat: "wx_demo",
  recordId: "LYa4PsNN4J",
  shopCode: "demo_shop",
  groupCode: "demo_group",
  orgCode: "demo_org",
  departmentCode: "demo_dept",
  objCode: "customer",
  plate: "皖JV066M",
};

function assignIfKnown(params: ApiRouteParams, key: string) {
  if (!(key in SAMPLE_VALUES)) {
    return;
  }
  const typed = key as keyof ApiRouteParams;
  if (params[typed]) {
    return;
  }
  params[typed] = SAMPLE_VALUES[typed];
}

function collectPlaceholderKeys(value: unknown, keys: Set<string>) {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    for (const match of value.matchAll(/\{\{(\w+)\}\}/g)) {
      keys.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPlaceholderKeys(item, keys);
    }
    return;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectPlaceholderKeys(nested, keys);
    }
  }
}

export function inferDefaultTestParams(endpoint: DfcApiEndpoint): ApiRouteParams {
  const params: ApiRouteParams = {};
  const keys = new Set<string>();

  if (endpoint.http?.queryParams) {
    for (const paramKey of Object.values(endpoint.http.queryParams)) {
      keys.add(paramKey);
    }
  }

  collectPlaceholderKeys(endpoint.http?.bodyTemplate, keys);

  for (const key of keys) {
    assignIfKnown(params, key);
  }

  const haystack = [
    endpoint.title,
    endpoint.description,
    endpoint.methodName,
    endpoint.http?.path,
    endpoint.dubbo?.method,
    endpoint.dubbo?.interfaceName,
    ...(endpoint.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/phone|手机|contact|weichat|wechat/.test(haystack)) {
    assignIfKnown(params, "phone");
  }
  if (/plate|车牌|license|keywords/.test(haystack)) {
    assignIfKnown(params, "plate");
  }
  if (/customer|客户|crm/.test(haystack)) {
    assignIfKnown(params, "objCode");
    assignIfKnown(params, "phone");
  }
  if (/shop|门店/.test(haystack)) {
    assignIfKnown(params, "shopCode");
  }
  if (/group|集团/.test(haystack)) {
    assignIfKnown(params, "groupCode");
  }

  return params;
}

export function mergeDefaultTestParams(
  endpoint: DfcApiEndpoint,
  override?: ApiRouteParams | null,
): ApiRouteParams {
  return {
    ...inferDefaultTestParams(endpoint),
    ...(override ?? {}),
  };
}

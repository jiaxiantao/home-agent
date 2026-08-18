/** HTTP 方法排序权重：GET 优先于 POST 等其它 HTTP */
export function httpMethodSortRank(
  kind: "http" | "dubbo",
  httpMethod?: string | null,
): number {
  if (kind === "http" && httpMethod?.toUpperCase() === "GET") {
    return 0;
  }
  if (kind === "http") {
    return 1;
  }
  return 2;
}

export const DFC_API_LIST_ORDER_BY_SQL = `ORDER BY agent_call_count DESC,
  CASE
    WHEN kind = 'http' AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(endpoint_json, '$.http.method'))) = 'GET' THEN 0
    WHEN kind = 'http' THEN 1
    ELSE 2
  END ASC,
  id ASC`;

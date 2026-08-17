export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const HTTP_METHOD_OPTIONS = HTTP_METHODS.map((method) => ({
  value: method,
  label: method,
}));

export function normalizeHttpMethod(
  value: string | undefined | null,
  fallback: HttpMethod = "GET",
): HttpMethod {
  const upper = value?.trim().toUpperCase();
  if (upper && (HTTP_METHODS as readonly string[]).includes(upper)) {
    return upper as HttpMethod;
  }
  return fallback;
}

/** 请求可携带 JSON Body 的主流方法 */
export function httpMethodAllowsBody(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE";
}

/** 表单/测试面板：Body Tab 还是 Query Tab */
export function httpMethodUsesBodyPanel(method: string): boolean {
  return httpMethodAllowsBody(method);
}

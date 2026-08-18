import type { DfcApiTestResult } from "@/lib/analytics/api-endpoint-test";

const MAX_JSON_CHARS = 12_000;

function truncateJson(value: unknown, maxChars = MAX_JSON_CHARS): string {
  if (value == null) {
    return "（无）";
  }
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n…（已截断，共 ${text.length} 字符）`;
}

function formatEndpointSummary(result: DfcApiTestResult) {
  const request = result.request;
  if (request?.kind === "http" && request.method && request.url) {
    return `${request.method} ${request.url}`;
  }
  if (request?.kind === "dubbo" && request.dubbo) {
    return `Dubbo ${request.dubbo.interfaceName}.${request.dubbo.method}`;
  }
  return result.title || result.endpointId;
}

function formatResultVerdict(result: DfcApiTestResult) {
  const httpStatus = result.response?.httpStatus;
  const statusLine = httpStatus != null ? `HTTP ${httpStatus}` : result.status;
  return result.ok ? `通过（${statusLine}）` : `失败（${statusLine}）`;
}

function formatRequestSection(result: DfcApiTestResult) {
  const request = result.request;
  if (!request) {
    return "（未记录请求预览）";
  }

  if (request.kind === "dubbo" && request.dubbo) {
    return [
      `类型: Dubbo RPC（当前仅目录登记，无法 HTTP 探测）`,
      `Interface: ${request.dubbo.interfaceName}`,
      `Method: ${request.dubbo.method}`,
      `入参 params:`,
      truncateJson(request.dubbo.params),
      request.body != null ? `Body:\n${truncateJson(request.body)}` : "",
      request.cookies && Object.keys(request.cookies).length
        ? `Cookies:\n${truncateJson(request.cookies)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Method: ${request.method ?? "—"}`,
    `URL: ${request.url ?? "—"}`,
    `环境变量 ${request.baseUrlEnvKey}: ${request.envConfigured ? "已配置" : "未配置"}`,
    `Headers:\n${truncateJson(request.headers ?? {})}`,
    request.query && Object.keys(request.query).length
      ? `Query:\n${truncateJson(request.query)}`
      : "",
    request.body != null ? `Body:\n${truncateJson(request.body)}` : "",
    request.cookies && Object.keys(request.cookies).length
      ? `Cookies:\n${truncateJson(request.cookies)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatResponseSection(result: DfcApiTestResult) {
  const response = result.response;
  if (!response) {
    return "（无 HTTP 响应，可能为环境未配置或请求未发出）";
  }

  const lines = [
    result.response?.httpStatus != null
      ? `HTTP Status: ${result.response.httpStatus}`
      : "",
    response.headers && Object.keys(response.headers).length
      ? `Response Headers:\n${truncateJson(response.headers)}`
      : "",
    response.body != null
      ? `Response Body:\n${truncateJson(response.body)}`
      : "Response Body: （空）",
  ].filter(Boolean);

  return lines.join("\n\n");
}

function formatAiHints(result: DfcApiTestResult) {
  const hints = [
    "这是大风车接口目录（dfc-data-agent）的自动化测试报告，请协助排查接口或默认测试配置问题。",
    `endpointId: ${result.endpointId}`,
    "排查时可关注：",
    "1. default_test_config（入参 / headers / query / body / cookies）是否缺失或样例值无效",
    "2. 是否缺少 SSO Cookie（_security_token）或 CRM 所需的 _source_code 等请求头",
    "3. 响应 body 中的业务错误码与 message 含义",
    "4. 接口路径、HTTP Method、Body 模板是否与 dafengche-backend 代码一致",
  ];

  if (result.envConfigured === false) {
    hints.push("5. 当前环境未配置网关 baseUrl（DFC_API_GATEWAY_BASE_URL 或 baseUrlEnvKey）");
  }
  if (result.status === "missing_params" || result.warning?.includes("缺少")) {
    hints.push("5. 上游可达但业务入参不足，请补充 default_test_params / default_test_config");
  }
  if (result.status === "auth" || /10001|登录超时|企业微信 access_token/i.test(result.message)) {
    hints.push(
      "5. 业务码 10001 若出现在 anduin：需要企业微信 access_token，不是 Mars SSO。目录与 host 无误，请走 SQL。",
    );
  }
  if (
    result.status === "upstream_unavailable" ||
    result.status === "skipped" ||
    /503|upstream connect/i.test(result.message)
  ) {
    hints.push(
      "5. HTTP 503 是网关没有可用 upstream，不是缺参。检查 DFC_API_*_BASE_URL 是否为 *.stable.dasouche.net；服务未部署则跳过探测并走 SQL。",
    );
  }
  if (
    result.status === "upstream_error" ||
    /HTTP 5\d\d|SYSTEM UNKNOWN ERROR/i.test(result.message)
  ) {
    hints.push(
      "5. 应用返回 5xx 说明 host 已打到该服务，不是缺参或域名错误。勿改 default_test_config，请 propose_sql。",
    );
  }

  return hints.join("\n");
}

export function formatDfcApiTestResultReport(
  result: DfcApiTestResult,
  options?: { testedAt?: Date },
) {
  const testedAt = (options?.testedAt ?? new Date()).toISOString();

  return [
    "# DFC 接口测试报告（单接口）",
    "",
    "## 元信息",
    `- endpointId: ${result.endpointId}`,
    `- 接口: ${formatEndpointSummary(result)}`,
    `- 标题: ${result.title}`,
    `- 类型: ${result.kind}`,
    `- 测试时间: ${testedAt}`,
    `- 结果: ${formatResultVerdict(result)}`,
    `- 内部状态: ${result.status}`,
    `- 耗时: ${result.durationMs}ms`,
    `- 环境已配置: ${result.envConfigured == null ? "未知" : result.envConfigured ? "是" : "否"}`,
    "",
    "## 结论",
    result.message,
    result.warning ? `\n## 警告\n${result.warning}` : "",
    "",
    "## 发送的请求",
    formatRequestSection(result),
    "",
    "## 收到的响应",
    formatResponseSection(result),
    "",
    "## 给 AI 的修复上下文",
    formatAiHints(result),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatBatchItemDetail(result: DfcApiTestResult, index: number) {
  return [
    `### ${index}. ${formatEndpointSummary(result)}`,
    `- endpointId: ${result.endpointId}`,
    `- 结果: ${formatResultVerdict(result)}`,
    `- 耗时: ${result.durationMs}ms`,
    `- 说明: ${result.message}`,
    result.warning ? `- 警告: ${result.warning}` : "",
    "",
    "请求:",
    formatRequestSection(result),
    "",
    "响应:",
    formatResponseSection(result),
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDfcApiBatchTestReport(
  results: DfcApiTestResult[],
  options?: { testedAt?: Date },
) {
  const testedAt = (options?.testedAt ?? new Date()).toISOString();
  const passed = results.filter((item) => item.ok);
  const failed = results.filter((item) => !item.ok);

  const sections = [
    "# DFC 接口批量测试报告",
    "",
    "## 摘要",
    `- 测试时间: ${testedAt}`,
    `- 总数: ${results.length}`,
    `- 通过: ${passed.length}`,
    `- 失败: ${failed.length}`,
    "",
  ];

  if (failed.length) {
    sections.push("## 失败接口（优先修复）", "");
    failed.forEach((result, index) => {
      sections.push(formatBatchItemDetail(result, index + 1), "");
    });
  }

  if (passed.length) {
    sections.push("## 通过接口", "");
    passed.forEach((result) => {
      sections.push(
        `- ${formatEndpointSummary(result)} | ${result.endpointId} | ${result.durationMs}ms | ${result.message}`,
      );
    });
    sections.push("");
  }

  sections.push(
    "## 给 AI 的修复上下文",
    "这是大风车接口目录的批量探测结果。请优先分析「失败接口」章节，结合 endpointId、请求与响应修复 default_test_config 或接口登记信息。",
    "若大量失败为 401/403 或业务码 10001：先看是否同一 token 下其它服务已通过。anduin CRM 运营接口要企业微信 access_token，Mars _security_token 无法通过，勿改 default_test_config。",
    "若为 missing_params，补充业务入参样例。",
    "若大量失败为 HTTP 503 / upstream connect error：这是测试域名或集群未部署，不是缺参。优先把 DFC_API_*_BASE_URL 改成 *.stable.dasouche.net（或 config/dfc-api-test-hosts.json 中的例外）；仍 503 则加入 skipHttpProbe，勿改 default_test_config，走 SQL。",
    "若失败为 HTTP 5xx（应用 JSON，如 SYSTEM UNKNOWN ERROR）：host 已可达，勿改 default_test_config，走 SQL。",
    "若失败为 Spring HTTP 404 Not Found：映射已在源码注释/下线，从目录排除，勿改 default_test_config。",
    "",
    "## 全部失败明细（完整请求/响应）",
  );

  if (failed.length) {
    failed.forEach((result, index) => {
      sections.push(formatBatchItemDetail(result, index + 1), "");
    });
  } else {
    sections.push("（无失败项）");
  }

  return sections.join("\n");
}

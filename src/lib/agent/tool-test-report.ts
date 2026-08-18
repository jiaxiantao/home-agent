import type { ToolTestResult } from "@/lib/agent/tool-test";

const MAX_OUTPUT_CHARS = 8_000;

function truncateText(text: string, maxChars = MAX_OUTPUT_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n…（已截断，共 ${text.length} 字符）`;
}

function formatResultVerdict(result: ToolTestResult) {
  return result.ok ? "通过" : "失败";
}

function formatDataSection(result: ToolTestResult) {
  if (result.data == null) {
    return "（无结构化 data）";
  }
  try {
    return truncateText(JSON.stringify(result.data, null, 2));
  } catch {
    return truncateText(String(result.data));
  }
}

function formatAiHints(result: ToolTestResult) {
  const hints = [
    "这是 dfc-data-agent 工具管理（Agent Tools）的自动化测试报告，请协助排查工具定义或默认测试参数问题。",
    `工具名: ${result.name}`,
    "排查时可关注：",
    "1. 工具 default_test_args / 测试参数 JSON 是否缺失或样例无效",
    "2. call_backend_api 是否缺少 endpointId、SSO 或上游 baseUrl 未配置",
    "3. execute_sql 是否未勾选「允许执行 SQL」",
    "4. 工具 output 与 data.status 是否与预期一致",
  ];

  if (result.warning) {
    hints.push(`5. 警告: ${result.warning}`);
  }
  if (result.error) {
    hints.push(`5. 错误: ${result.error}`);
  }

  return hints.join("\n");
}

export function formatAgentToolTestResultReport(
  result: ToolTestResult,
  options?: { testedAt?: Date },
) {
  const testedAt = (options?.testedAt ?? new Date()).toISOString();

  return [
    "# Agent 工具测试报告（单工具）",
    "",
    "## 元信息",
    `- 工具名: ${result.name}`,
    `- 显示名: ${result.label}`,
    `- 测试时间: ${testedAt}`,
    `- 结果: ${formatResultVerdict(result)}`,
    `- 耗时: ${result.durationMs}ms`,
    "",
    result.error ? `## 错误\n${result.error}` : "",
    result.warning ? `## 警告\n${result.warning}` : "",
    "",
    "## 工具输出 output",
    result.output ? truncateText(result.output) : "（无 output）",
    "",
    "## 结构化 data",
    formatDataSection(result),
    "",
    "## 给 AI 的修复上下文",
    formatAiHints(result),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatBatchItemDetail(result: ToolTestResult, index: number) {
  return [
    `### ${index}. ${result.label} (${result.name})`,
    `- 结果: ${formatResultVerdict(result)}`,
    `- 耗时: ${result.durationMs}ms`,
    result.error ? `- 错误: ${result.error}` : "",
    result.warning ? `- 警告: ${result.warning}` : "",
    "",
    "output:",
    result.output ? truncateText(result.output, 4_000) : "（无）",
    "",
    "data:",
    formatDataSection(result),
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatAgentToolsBatchTestReport(
  results: ToolTestResult[],
  options?: { testedAt?: Date },
) {
  const testedAt = (options?.testedAt ?? new Date()).toISOString();
  const passed = results.filter((item) => item.ok);
  const failed = results.filter((item) => !item.ok);

  const sections = [
    "# Agent 工具批量测试报告",
    "",
    "## 摘要",
    `- 测试时间: ${testedAt}`,
    `- 总数: ${results.length}`,
    `- 通过: ${passed.length}`,
    `- 失败: ${failed.length}`,
    "",
  ];

  if (failed.length) {
    sections.push("## 失败工具（优先修复）", "");
    failed.forEach((result, index) => {
      sections.push(formatBatchItemDetail(result, index + 1), "");
    });
  }

  if (passed.length) {
    sections.push("## 通过工具", "");
    passed.forEach((result) => {
      sections.push(
        `- ${result.label} | ${result.name} | ${result.durationMs}ms${result.warning ? ` | ${result.warning}` : ""}`,
      );
    });
    sections.push("");
  }

  sections.push(
    "## 给 AI 的修复上下文",
    "这是 dfc-data-agent 工具管理的批量测试结果。请优先分析「失败工具」章节，结合工具名、output 与 data 修复 default_test_args 或工具 HTTP 配置。",
    "若 call_backend_api 大量 not_configured，检查 config/dfc-api.env；若为 execute_sql，确认测试时是否允许执行。",
    "",
    "## 全部失败明细（完整 output/data）",
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

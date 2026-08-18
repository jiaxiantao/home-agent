import { describe, expect, it } from "vitest";

import {
  formatAgentToolsBatchTestReport,
  formatAgentToolTestResultReport,
} from "@/lib/agent/tool-test-report";
import type { ToolTestResult } from "@/lib/agent/tool-test";

const sampleResult: ToolTestResult = {
  name: "route_api",
  label: "路由接口",
  ok: false,
  durationMs: 120,
  output: "候选接口：super-mario …",
  error: "测试未通过",
  data: { status: "error", message: "upstream timeout" },
};

describe("tool-test-report", () => {
  it("formats single tool report", () => {
    const report = formatAgentToolTestResultReport(sampleResult, {
      testedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(report).toContain("# Agent 工具测试报告");
    expect(report).toContain("route_api");
    expect(report).toContain("upstream timeout");
  });

  it("formats batch tool report", () => {
    const passed: ToolTestResult = {
      name: "list_schema",
      label: "列 schema",
      ok: true,
      durationMs: 5,
      output: "ok",
    };
    const report = formatAgentToolsBatchTestReport([sampleResult, passed], {
      testedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(report).toContain("# Agent 工具批量测试报告");
    expect(report).toContain("失败工具");
    expect(report).toContain("list_schema");
  });
});

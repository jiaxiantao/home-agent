import { describe, expect, it } from "vitest";

import type { DfcApiTestResult } from "@/lib/analytics/api-endpoint-test";
import {
  formatDfcApiBatchTestReport,
  formatDfcApiTestResultReport,
} from "@/lib/analytics/api-endpoint-test-report";

const sampleResult: DfcApiTestResult = {
  endpointId: "super-mario:http:GET:/v1/foo:bar",
  title: "查询客户",
  kind: "http",
  ok: false,
  durationMs: 120,
  status: "error",
  message: "上游返回业务错误",
  warning: "缺少 phone 参数",
  envConfigured: true,
  request: {
    kind: "http",
    method: "GET",
    url: "https://gateway.example/v1/foo",
    query: { phone: "16612341112" },
    headers: { Accept: "application/json" },
    cookies: { _security_token: "demo" },
    envConfigured: true,
    baseUrlEnvKey: "DFC_API_GATEWAY_BASE_URL",
  },
  response: {
    httpStatus: 500,
    body: { code: "500", message: "internal error" },
  },
};

describe("api-endpoint-test-report", () => {
  it("formats single result for AI consumption", () => {
    const report = formatDfcApiTestResultReport(sampleResult, {
      testedAt: new Date("2026-08-17T09:00:00.000Z"),
    });
    expect(report).toContain("# DFC 接口测试报告（单接口）");
    expect(report).toContain("endpointId: super-mario:http:GET:/v1/foo:bar");
    expect(report).toContain("GET https://gateway.example/v1/foo");
    expect(report).toContain("HTTP Status: 500");
    expect(report).toContain("给 AI 的修复上下文");
    expect(report).toContain("_security_token");
  });

  it("formats batch report with failed section first", () => {
    const passed: DfcApiTestResult = { ...sampleResult, ok: true, status: "success" };
    const report = formatDfcApiBatchTestReport([sampleResult, passed], {
      testedAt: new Date("2026-08-17T09:00:00.000Z"),
    });
    expect(report).toContain("# DFC 接口批量测试报告");
    expect(report).toContain("总数: 2");
    expect(report).toContain("失败: 1");
    expect(report).toContain("## 失败接口（优先修复）");
    expect(report).toContain("## 通过接口");
  });
});

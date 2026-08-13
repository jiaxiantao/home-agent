import { describe, expect, it } from "vitest";

import { formatAgentTraceText } from "@/components/agent-trace-panel";

describe("formatAgentTraceText", () => {
  it("joins trace lines for clipboard copy", () => {
    expect(
      formatAgentTraceText([
        { id: "1", kind: "trace", text: "[start] LangGraph Agent 循环启动" },
        { id: "2", kind: "a2ui", text: "A2UI surface: 查询结果" },
      ]),
    ).toBe(
      "[trace] [start] LangGraph Agent 循环启动\n[a2ui] A2UI surface: 查询结果",
    );
  });
});

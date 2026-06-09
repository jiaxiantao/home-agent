import { describe, expect, it } from "vitest";

import { parsePlanFromLlm } from "@/lib/agent/planner-schema";

describe("parsePlanFromLlm", () => {
  it("parses tool plan", () => {
    const plan = parsePlanFromLlm(
      JSON.stringify({
        action: "tool",
        tool: "calculate",
        args: { expression: "1+1" },
        reasoning: "需要计算",
      }),
    );

    expect(plan).toEqual({
      action: "tool",
      tool: "calculate",
      args: { expression: "1+1" },
      reasoning: "需要计算",
    });
  });

  it("parses answer plan", () => {
    const plan = parsePlanFromLlm(
      JSON.stringify({
        action: "answer",
        answer: "结果是 2",
      }),
    );

    expect(plan.action).toBe("answer");
    if (plan.action === "answer") {
      expect(plan.answer).toBe("结果是 2");
    }
  });

  it("rejects unknown tool", () => {
    expect(() =>
      parsePlanFromLlm(
        JSON.stringify({
          action: "tool",
          tool: "unknown_tool",
          args: {},
        }),
      ),
    ).toThrow("Planner JSON 格式无效");
  });

  it("rejects invalid json shape", () => {
    expect(() => parsePlanFromLlm(JSON.stringify({ action: "tool" }))).toThrow(
      "Planner JSON 格式无效",
    );
  });
});

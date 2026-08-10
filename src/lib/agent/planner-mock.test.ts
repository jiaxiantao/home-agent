import { describe, expect, it } from "vitest";

import { buildMockPlan } from "@/lib/agent/planner-mock";

describe("buildMockPlan", () => {
  it("prefers search_notes for knowledge queries", () => {
    const plan = buildMockPlan("帮我搜索笔记里的架构内容", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("search_notes");
    }
  });

  it("prefers calculate for math queries", () => {
    const plan = buildMockPlan("计算 12 + 8", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("calculate");
      expect(plan.args).toEqual({ expression: "12 + 8" });
    }
  });

  it("prefers current_time for time queries", () => {
    const plan = buildMockPlan("现在几点？", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("current_time");
    }
  });

  it("answers after prior tool results", () => {
    const plan = buildMockPlan("总结一下", [
      {
        tool: "search_notes",
        args: { query: "架构" },
        output: "1. 架构笔记",
      },
    ]);

    expect(plan.action).toBe("answer");
  });

  it("proposes sql for analytics questions", () => {
    const plan = buildMockPlan("大风车正式车源一共有多少辆？", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("propose_sql");
      expect(String(plan.args.sql)).toMatch(/select/i);
    }
  });
});

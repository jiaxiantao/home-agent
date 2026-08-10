import { describe, expect, it } from "vitest";

import { buildMockPlan } from "@/lib/agent/planner-mock";

describe("buildMockPlan", () => {
  it("lists schema when user asks about tables", () => {
    const plan = buildMockPlan("分析库有哪些核心表和字段？", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("list_schema");
    }
  });

  it("proposes sql for analytics questions", () => {
    const plan = buildMockPlan("大风车正式车源一共有多少辆？", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("propose_sql");
      expect(String(plan.args.sql)).toMatch(/select/i);
    }
  });

  it("answers after prior tool results", () => {
    const plan = buildMockPlan("总结一下", [
      {
        tool: "propose_sql",
        args: { sql: "SELECT 1" },
        output: "待确认 SQL",
      },
    ]);

    expect(plan.action).toBe("answer");
  });
});

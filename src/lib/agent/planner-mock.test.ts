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

  it("lists project databases when user asks about dfc databases", () => {
    const plan = buildMockPlan("大风车项目现在有哪些数据库？", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("list_project_databases");
    }
  });

  it("describes table when user asks column types for a table", () => {
    const plan = buildMockPlan("car 表有哪些字段？每个字段是什么类型？", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("describe_table");
      expect(plan.args.table).toBe("car");
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

  it("rewrites follow-up questions using prior assistant sql", () => {
    const plan = buildMockPlan(
      "那按城市分布呢？",
      [],
      [
        {
          role: "user",
          content: "大风车正式车源一共有多少辆？",
        },
        {
          role: "assistant",
          content: "查询成功",
          sql: "SELECT COUNT(*) AS car_count FROM car WHERE test_type = 0",
        },
      ],
    );

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("propose_sql");
      expect(String(plan.args.sql)).toMatch(/city_code/i);
    }
  });
});

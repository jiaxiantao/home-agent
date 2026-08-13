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

  it("routes analytics questions before proposing sql", () => {
    const plan = buildMockPlan("大风车正式车源一共有多少辆？", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("route_question");
      expect(String(plan.args.question)).toMatch(/车源/);
    }
  });

  it("proposes qualified sql after route_question", () => {
    const plan = buildMockPlan("大风车正式车源一共有多少辆？", [
      {
        tool: "route_question",
        args: { question: "大风车正式车源一共有多少辆？" },
        output: "routed",
        data: {
          suggestedDatabase: "matador",
          suggestedTable: undefined,
          topTables: [],
        },
      },
    ]);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("propose_sql");
      expect(String(plan.args.sql)).toMatch(/`matador`\.`car`/i);
      expect(String(plan.args.sql)).toMatch(/select/i);
    }
  });

  it("proposes crazy_kartrider.car sql for plate lookup", () => {
    const plan = buildMockPlan("查询车牌号为皖JV066M的车辆信息", []);
    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("propose_sql");
      expect(String(plan.args.sql)).toMatch(/`crazy_kartrider`\.`car`/i);
      expect(String(plan.args.sql)).toMatch(/plate_number = '皖JV066M'/);
      expect(String(plan.args.sql)).toMatch(/date_delete = 0/);
    }
  });

  it("routes customer recordId questions to backend API first", () => {
    const plan = buildMockPlan("我想知道客户 id 为 demo_user_001 的用户信息", []);
    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("route_api");
    }
  });

  it("routes customer phone questions to backend API first", () => {
    const plan = buildMockPlan("我想知道客户手机号为 13166990795 的客户信息", []);
    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("route_api");
    }
  });

  it("proposes CRM customer sql fallback after API failure", () => {
    const plan = buildMockPlan("我想知道客户 id 为 demo_user_001 的用户信息", [
      {
        tool: "route_api",
        args: { question: "我想知道客户 id 为 demo_user_001 的用户信息" },
        output: "接口路由",
        data: {
          bestMatch: {
            endpoint: {
              id: "super-mario:http:GET:/customer/customerDetail/queryRecordDetail:queryRecordDetail",
            },
            httpCallable: true,
            extractedParams: { recordId: "demo_user_001", objCode: "customer" },
          },
        },
      },
      {
        tool: "call_backend_api",
        args: {
          endpointId:
            "super-mario:http:GET:/customer/customerDetail/queryRecordDetail:queryRecordDetail",
          recordId: "demo_user_001",
        },
        output: "网络不可达",
        data: {
          status: "error",
          failureKind: "network",
          suggestedSql:
            "SELECT id, name, phone, shop_code, owner, grade, source, date_create, date_update FROM `super_mario`.`customer` WHERE id = 'demo_user_001' LIMIT 20",
          sqlFallback: { database: "super_mario", table: "customer" },
        },
      },
    ]);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("propose_sql");
      expect(String(plan.args.sql)).toMatch(/super_mario.*customer/i);
      expect(String(plan.args.sql)).toContain("demo_user_001");
      expect(String(plan.args.sql)).not.toMatch(/shop_code\s*=/);
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

  it("lists tables for a named database", () => {
    const plan = buildMockPlan("danube_member 库里有哪些表？", []);

    expect(plan.action).toBe("tool");
    if (plan.action === "tool") {
      expect(plan.tool).toBe("list_tables");
      expect(plan.args.database).toBe("danube_member");
    }
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

// NL → SQL / 工具规划黄金用例（规则规划器回归）
// 用于无 LLM / CI 场景，保证核心问法路由稳定

import type { AgentToolResult } from "@/lib/agent/types";

export type GoldenCase = {
  id: string;
  question: string;
  /** 模拟 prior 工具结果（如已完成 route_question） */
  prior?: AgentToolResult[];
  expect: {
    action: "tool" | "answer";
    tool?: string;
    sqlIncludes?: string[];
    sqlExcludes?: string[];
    argsIncludes?: Record<string, string>;
  };
};

function routedPrior(
  question: string,
  suggestedDatabase = "matador",
): AgentToolResult[] {
  return [
    {
      tool: "route_api",
      args: { question },
      output: "未命中可调用 HTTP",
      data: {
        question,
        bestMatch: null,
        candidates: [],
      },
    },
    {
      tool: "search_api",
      args: { question, keyword: question },
      output: "无命中",
      data: { keyword: question, matches: [] },
    },
    {
      tool: "route_question",
      args: { question },
      output: `问题路由「${question}」→ ${suggestedDatabase}`,
      data: {
        question,
        suggestedDatabase,
        suggestedTable: undefined,
        candidates: [{ database: suggestedDatabase, score: 10, reasons: ["golden"] }],
        searchTerms: [],
        hits: [],
        topTables: [],
      },
    },
  ];
}

export const nlSqlGoldenCases: GoldenCase[] = [
  {
    id: "car-count-route",
    question: "大风车正式车源一共有多少辆？",
    expect: {
      action: "tool",
      tool: "route_api",
    },
  },
  {
    id: "car-count",
    question: "大风车正式车源一共有多少辆？",
    prior: routedPrior("大风车正式车源一共有多少辆？"),
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["matador", "car", "test_type = 0", "COUNT"],
      sqlExcludes: ["DELETE", "UPDATE", "INSERT"],
    },
  },
  {
    id: "car-status-dist",
    question: "统计各状态的正式车源数量分布",
    prior: routedPrior("统计各状态的正式车源数量分布"),
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["car_status", "GROUP BY", "test_type = 0"],
    },
  },
  {
    id: "ops-trend",
    question: "看一下最近运营日报里新增车源和求购的趋势",
    prior: routedPrior("看一下最近运营日报里新增车源和求购的趋势"),
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["operate_report", "car_new", "buy_new"],
    },
  },
  {
    id: "order-count",
    question: "主订单一共有多少（排除已删除）？",
    prior: routedPrior("主订单一共有多少（排除已删除）？"),
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["main_order", "delete_time IS NULL"],
    },
  },
  {
    id: "buy-count",
    question: "正式求购线索总量是多少？",
    prior: routedPrior("正式求购线索总量是多少？"),
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["buy_car", "test_type = 0"],
    },
  },
  {
    id: "member-route",
    question: "会员中心有多少注册用户？",
    expect: {
      action: "tool",
      tool: "route_api",
    },
  },
  {
    id: "customer-by-phone-api",
    question: "我想知道客户手机号为 13166990795 的客户信息",
    expect: {
      action: "tool",
      tool: "route_api",
      argsIncludes: { question: "我想知道客户手机号为 13166990795 的客户信息" },
    },
  },
  {
    id: "customer-by-phone-sql-fallback",
    question: "帮我查询客户手机号为16612341112的客户信息",
    prior: [
      {
        tool: "route_api",
        args: { question: "帮我查询客户手机号为16612341112的客户信息" },
        output: "接口路由",
        data: {
          bestMatch: {
            endpoint: {
              id: "super-mario:http:GET:/queryCustomerDetailsByContact:queryCustomerDetailsByContact",
            },
            httpCallable: true,
            extractedParams: { phone: "16612341112" },
          },
        },
      },
      {
        tool: "call_backend_api",
        args: {
          endpointId:
            "super-mario:http:GET:/queryCustomerDetailsByContact:queryCustomerDetailsByContact",
          phone: "16612341112",
        },
        output: "未配置",
        data: {
          status: "not_configured",
          sqlFallback: { database: "super_mario", table: "customer" },
        },
      },
      {
        tool: "route_question",
        args: { question: "帮我查询客户手机号为16612341112的客户信息" },
        output: "routed",
        data: {
          suggestedDatabase: "super_mario",
          suggestedTable: "customer",
        },
      },
    ],
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["super_mario", "customer", "16612341112", "phone"],
    },
  },
  {
    id: "customer-by-id-route",
    question: "我想知道客户 id 为 demo_user_001 的用户信息",
    expect: {
      action: "tool",
      tool: "route_api",
    },
  },
  {
    id: "customer-by-id-sql",
    question: "我想知道客户 id 为 demo_user_001 的用户信息",
    prior: [
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
          objCode: "customer",
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
    ],
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["super_mario", "customer", "demo_user_001"],
      sqlExcludes: ["cheniu_user", "DELETE", "UPDATE", "INSERT", "shop_code ="],
    },
  },
  {
    id: "schema-catalog",
    question: "分析库有哪些核心表和字段？",
    expect: {
      action: "tool",
      tool: "list_schema",
    },
  },
  {
    id: "project-dbs",
    question: "大风车项目现在有哪些数据库？",
    expect: {
      action: "tool",
      tool: "list_project_databases",
    },
  },
  {
    id: "describe-car",
    question: "car 表有哪些字段？每个字段是什么类型？",
    expect: {
      action: "tool",
      tool: "describe_table",
      argsIncludes: { table: "car" },
    },
  },
  {
    id: "list-tables",
    question: "matador 库里有哪些表？",
    expect: {
      action: "tool",
      tool: "list_tables",
    },
  },
];

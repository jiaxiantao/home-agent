// NL → SQL / 工具规划黄金用例（规则规划器回归）
// 用于无 LLM / CI 场景，保证核心问法路由稳定

export type GoldenCase = {
  id: string;
  question: string;
  expect: {
    action: "tool" | "answer";
    tool?: string;
    sqlIncludes?: string[];
    sqlExcludes?: string[];
    argsIncludes?: Record<string, string>;
  };
};

export const nlSqlGoldenCases: GoldenCase[] = [
  {
    id: "car-count",
    question: "大风车正式车源一共有多少辆？",
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["FROM car", "test_type = 0", "COUNT"],
      sqlExcludes: ["DELETE", "UPDATE", "INSERT"],
    },
  },
  {
    id: "car-status-dist",
    question: "统计各状态的正式车源数量分布",
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["car_status", "GROUP BY", "test_type = 0"],
    },
  },
  {
    id: "ops-trend",
    question: "看一下最近运营日报里新增车源和求购的趋势",
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["operate_report", "car_new", "buy_new"],
    },
  },
  {
    id: "order-count",
    question: "主订单一共有多少（排除已删除）？",
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["main_order", "delete_time IS NULL"],
    },
  },
  {
    id: "buy-count",
    question: "正式求购线索总量是多少？",
    expect: {
      action: "tool",
      tool: "propose_sql",
      sqlIncludes: ["buy_car", "test_type = 0"],
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

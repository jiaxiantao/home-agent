import { getAnalyticsMysqlConfig } from "@/lib/analytics/mysql";

export type ProjectDatabaseEntry = {
  name: string;
  description: string;
  domain: "car" | "trade" | "lead" | "ops" | "platform";
  env: "test" | "prepub" | "prod" | "unknown";
  notes?: string[];
};

/** 大风车项目已知 MySQL 库登记（业务说明；实际可见库以连接权限为准） */
export const dfcProjectDatabaseRegistry: ProjectDatabaseEntry[] = [
  {
    name: "matador",
    description: "大风车核心业务库：车源、订单、求购、运营报表等",
    domain: "car",
    env: "test",
    notes: [
      "当前 Agent 默认连接此库（ANALYTICS_MYSQL_DATABASE）",
      "正式数据常用 test_type = 0；订单需 delete_time IS NULL",
    ],
  },
];

export function listProjectDatabaseRegistry() {
  const config = getAnalyticsMysqlConfig();
  const defaultDatabase = config?.database;

  return dfcProjectDatabaseRegistry.map((entry) => ({
    ...entry,
    isDefault: entry.name === defaultDatabase,
    connectedHost: config?.host,
    connectedPort: config?.port,
  }));
}

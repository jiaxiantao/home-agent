import { getAnalyticsMysqlConfig } from "@/lib/analytics/mysql";

export type ProjectDatabaseDomain =
  | "car"
  | "trade"
  | "lead"
  | "ops"
  | "member"
  | "market"
  | "finance"
  | "contract"
  | "platform"
  | "other";

export type ProjectDatabaseEntry = {
  name: string;
  description: string;
  domain: ProjectDatabaseDomain;
  env: "test" | "prepub" | "prod" | "unknown";
  notes?: string[];
};

/**
 * 大风车项目已知 MySQL 业务库登记。
 * 实际可访问性以当前连接账号 SHOW DATABASES 为准（同实例跨库查询可用 `db`.`table`）。
 */
export const dfcProjectDatabaseRegistry: ProjectDatabaseEntry[] = [
  {
    name: "matador",
    description: "大风车核心业务库：车源、订单、求购、运营报表等",
    domain: "car",
    env: "test",
    notes: [
      "默认连接库（ANALYTICS_MYSQL_DATABASE）",
      "正式数据常用 test_type = 0；订单需 delete_time IS NULL",
    ],
  },
  {
    name: "danube_member",
    description: "大风车会员",
    domain: "member",
    env: "test",
  },
  {
    name: "danube_topcars",
    description: "找车源",
    domain: "car",
    env: "test",
  },
  {
    name: "danube_usedcar_market",
    description: "二手车市场",
    domain: "market",
    env: "test",
  },
  {
    name: "danube_service_market",
    description: "服务市场 / 商品交易",
    domain: "market",
    env: "test",
  },
  {
    name: "danube_mammon",
    description: "金融相关",
    domain: "finance",
    env: "test",
  },
  {
    name: "danube_electronic_contract",
    description: "电子合同",
    domain: "contract",
    env: "test",
  },
  {
    name: "danube_league",
    description: "联盟",
    domain: "platform",
    env: "test",
  },
  {
    name: "danube_deal_adapter",
    description: "成交适配",
    domain: "trade",
    env: "test",
  },
  {
    name: "danube_statistics",
    description: "统计数据",
    domain: "ops",
    env: "test",
  },
  {
    name: "danube_statemachine",
    description: "状态机",
    domain: "platform",
    env: "test",
  },
  {
    name: "danube_chaos",
    description: "chaos 业务",
    domain: "other",
    env: "test",
  },
  {
    name: "danube_roam",
    description: "roam 业务",
    domain: "other",
    env: "test",
  },
  {
    name: "danube_migrate",
    description: "迁移相关",
    domain: "platform",
    env: "test",
  },
  {
    name: "danube_postern",
    description: "postern",
    domain: "platform",
    env: "test",
  },
  {
    name: "danube_report_script",
    description: "报表脚本",
    domain: "ops",
    env: "test",
  },
  {
    name: "danube_report_script_web",
    description: "报表脚本 Web",
    domain: "ops",
    env: "test",
  },
  {
    name: "danube-activity-center",
    description: "活动中心",
    domain: "ops",
    env: "test",
    notes: ["库名含连字符，SQL 中必须使用反引号限定：`danube-activity-center`.`table`"],
  },
  {
    name: "super_mario",
    description: "super-mario 业务",
    domain: "platform",
    env: "test",
  },
  {
    name: "souche_dfc",
    description: "大风车相关（souche_dfc）",
    domain: "platform",
    env: "test",
  },
];

export function getRegistryDatabaseNames() {
  return dfcProjectDatabaseRegistry.map((entry) => entry.name);
}

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

export function formatProjectDatabasesForPrompt() {
  return dfcProjectDatabaseRegistry
    .map(
      (entry) =>
        `- ${entry.name} [${entry.domain}] — ${entry.description}${
          entry.notes?.length ? `（${entry.notes.join("；")}）` : ""
        }`,
    )
    .join("\n");
}

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
  | "crm"
  | "messaging"
  | "detect"
  | "other";

export type ProjectDatabaseEntry = {
  name: string;
  description: string;
  domain: ProjectDatabaseDomain;
  env: "test" | "prepub" | "prod" | "unknown";
  /** 自然语言路由关键词（中文或英文） */
  keywords?: string[];
  notes?: string[];
};

/** 大风车 DBHub 全量业务库数量（与 config/dbhub-dfc-sources.toml 对齐） */
export const DFC_DATABASE_COUNT = 42;

/**
 * 大风车项目已知 MySQL 业务库登记（DBHub sources 全量）。
 * 实际可访问性以当前连接账号 SHOW DATABASES 为准（同实例跨库查询可用 `db`.`table`）。
 */
export const dfcProjectDatabaseRegistry: ProjectDatabaseEntry[] = [
  {
    name: "anduin",
    description: "企业微信",
    domain: "platform",
    env: "test",
    keywords: ["企业微信", "企微", "anduin", "wecom", "work wechat"],
  },
  {
    name: "arche_blade",
    description: "消息推送",
    domain: "messaging",
    env: "test",
    keywords: ["消息推送", "推送", "arche_blade", "push", "notification"],
  },
  {
    name: "cheniu",
    description: "车牛",
    domain: "platform",
    env: "test",
    keywords: ["车牛", "cheniu"],
  },
  {
    name: "cheniu_user",
    description: "车牛用户",
    domain: "member",
    env: "test",
    keywords: ["车牛用户", "cheniu_user", "用户中心"],
  },
  {
    name: "crazy_kartrider",
    description: "车辆管理",
    domain: "car",
    env: "test",
    keywords: ["车辆管理", "crazy_kartrider", "kartrider"],
  },
  {
    name: "da_vinci",
    description: "数据分析",
    domain: "ops",
    env: "test",
    keywords: ["数据分析", "da_vinci", "达芬奇", "分析平台"],
  },
  {
    name: "danube-activity-center",
    description: "活动中心",
    domain: "ops",
    env: "test",
    keywords: ["活动中心", "运营活动", "activity center"],
    notes: ["库名含连字符，SQL 中必须使用反引号限定：`danube-activity-center`.`table`"],
  },
  {
    name: "danube_chaos",
    description: "定制对象",
    domain: "other",
    env: "test",
    keywords: ["定制对象", "chaos", "自定义对象", "danube_chaos"],
  },
  {
    name: "danube_deal_adapter",
    description: "交易适配",
    domain: "trade",
    env: "test",
    keywords: ["交易适配", "成交适配", "deal adapter", "danube_deal_adapter"],
  },
  {
    name: "danube_electronic_contract",
    description: "电子合同",
    domain: "contract",
    env: "test",
    keywords: ["电子合同", "合同", "签章", "contract"],
  },
  {
    name: "danube_league",
    description: "联盟",
    domain: "platform",
    env: "test",
    keywords: ["联盟", "danube_league", "league"],
  },
  {
    name: "danube_mammon",
    description: "财神爷/财务",
    domain: "finance",
    env: "test",
    keywords: ["财神爷", "财务", "金融", "贷款", "放款", "mammon"],
  },
  {
    name: "danube_member",
    description: "会员",
    domain: "member",
    env: "test",
    keywords: ["会员", "会员中心", "member", "vip"],
  },
  {
    name: "danube_migrate",
    description: "迁移",
    domain: "platform",
    env: "test",
    keywords: ["迁移", "migrate", "danube_migrate"],
  },
  {
    name: "danube_postern",
    description: "postern",
    domain: "platform",
    env: "test",
    keywords: ["postern", "danube_postern"],
  },
  {
    name: "danube_report_script",
    description: "报表脚本",
    domain: "ops",
    env: "test",
    keywords: ["报表脚本", "report script"],
  },
  {
    name: "danube_report_script_web",
    description: "报表脚本web",
    domain: "ops",
    env: "test",
    keywords: ["报表脚本web", "report script web"],
  },
  {
    name: "danube_roam",
    description: "节点漫游",
    domain: "platform",
    env: "test",
    keywords: ["节点漫游", "roam", "漫游"],
  },
  {
    name: "danube_service_market",
    description: "服务市场",
    domain: "market",
    env: "test",
    keywords: ["服务市场", "商品交易", "service market"],
  },
  {
    name: "danube_statemachine",
    description: "状态机",
    domain: "platform",
    env: "test",
    keywords: ["状态机", "statemachine", "state machine"],
  },
  {
    name: "danube_statistics",
    description: "统计",
    domain: "ops",
    env: "test",
    keywords: ["统计", "数据统计", "statistics"],
  },
  {
    name: "danube_topcars",
    description: "找车源",
    domain: "car",
    env: "test",
    keywords: ["找车源", "topcars", "撮合车源"],
  },
  {
    name: "danube_usedcar_market",
    description: "二手车市场",
    domain: "market",
    env: "test",
    keywords: ["二手车市场", "usedcar", "市场车源"],
  },
  {
    name: "detect_business",
    description: "检测业务",
    domain: "detect",
    env: "test",
    keywords: ["检测业务", "detect business", "检测单"],
  },
  {
    name: "glorious_mission",
    description: "任务管理",
    domain: "ops",
    env: "test",
    keywords: ["任务管理", "任务", "glorious_mission", "mission"],
  },
  {
    name: "jiaxuan_huaguo",
    description: "微店/花果",
    domain: "market",
    env: "test",
    keywords: ["微店", "花果", "huaguo", "jiaxuan"],
  },
  {
    name: "jiaxuan_sword",
    description: "工作台入口",
    domain: "platform",
    env: "test",
    keywords: ["工作台", "工作台入口", "sword", "jiaxuan_sword"],
  },
  {
    name: "maple_story",
    description: "线索分发",
    domain: "lead",
    env: "test",
    keywords: ["线索分发", "线索", "maple_story", "lead distribute"],
  },
  {
    name: "marketing_scrm",
    description: "SCRM",
    domain: "crm",
    env: "test",
    keywords: ["scrm", "私域", "营销scrm", "marketing_scrm"],
  },
  {
    name: "matador",
    description: "matador 核心",
    domain: "car",
    env: "test",
    keywords: ["matador", "大风车核心", "车源", "求购", "运营日报"],
    notes: [
      "正式数据常用 test_type = 0；订单需 delete_time IS NULL",
    ],
  },
  {
    name: "rich_man",
    description: "订单管理",
    domain: "trade",
    env: "test",
    keywords: ["订单管理", "rich_man", "rich man"],
  },
  {
    name: "souche_cannon",
    description: "营销推送",
    domain: "messaging",
    env: "test",
    keywords: ["营销推送", "cannon", "souche_cannon"],
  },
  {
    name: "souche_detect",
    description: "检测",
    domain: "detect",
    env: "test",
    keywords: ["检测", "souche_detect", "车况检测"],
  },
  {
    name: "souche_dfc",
    description: "大风车 souche_dfc",
    domain: "platform",
    env: "test",
    keywords: ["大风车", "souche_dfc", "dfc"],
  },
  {
    name: "souche_league",
    description: "联盟",
    domain: "platform",
    env: "test",
    keywords: ["souche_league", "搜车联盟"],
  },
  {
    name: "souche_lute",
    description: "配置服务",
    domain: "platform",
    env: "test",
    keywords: ["配置服务", "lute", "souche_lute", "配置中心"],
  },
  {
    name: "souche_no_word_book",
    description: "产品手册",
    domain: "platform",
    env: "test",
    keywords: ["产品手册", "no word book", "手册"],
  },
  {
    name: "souche_scidea",
    description: "搜车idea",
    domain: "platform",
    env: "test",
    keywords: ["搜车idea", "scidea", "创意"],
  },
  {
    name: "souche_thriver",
    description: "数据报表",
    domain: "ops",
    env: "test",
    keywords: ["数据报表", "thriver", "报表"],
  },
  {
    name: "souche_trade",
    description: "交易",
    domain: "trade",
    env: "test",
    keywords: ["交易", "souche_trade", "搜车交易"],
  },
  {
    name: "suez",
    description: "B2B交易",
    domain: "trade",
    env: "test",
    keywords: ["b2b", "b2b交易", "suez"],
  },
  {
    name: "super_mario",
    description: "客户管理",
    domain: "crm",
    env: "test",
    keywords: ["客户管理", "super_mario", "super mario", "超级玛丽", "crm客户"],
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
          entry.keywords?.length ? `（关键词：${entry.keywords.slice(0, 5).join("、")}）` : ""
        }${
          entry.notes?.length ? `｜${entry.notes.join("；")}` : ""
        }`,
    )
    .join("\n");
}

/** 按登记 keywords 匹配问题中的自然语言片段 */
export function matchRegistryKeywords(question: string): Array<{
  database: string;
  keyword: string;
  entry: ProjectDatabaseEntry;
}> {
  const normalized = question.trim();
  const matches: Array<{
    database: string;
    keyword: string;
    entry: ProjectDatabaseEntry;
  }> = [];
  const seen = new Set<string>();

  for (const entry of dfcProjectDatabaseRegistry) {
    for (const keyword of entry.keywords ?? []) {
      const key = `${entry.name}:${keyword}`;
      if (seen.has(key)) {
        continue;
      }
      const hit =
        normalized.includes(keyword) ||
        normalized.toLowerCase().includes(keyword.toLowerCase());
      if (hit) {
        seen.add(key);
        matches.push({ database: entry.name, keyword, entry });
      }
    }
  }

  return matches;
}

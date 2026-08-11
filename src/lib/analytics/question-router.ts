import {
  dfcProjectDatabaseRegistry,
  type ProjectDatabaseEntry,
} from "@/lib/analytics/project-databases";
import { getPreferredAnalyticsDatabase } from "@/lib/analytics/preferred-database";
import { filterAllowedDatabaseNames } from "@/lib/security/database-allowlist";

export type RouteKeywordRule = {
  pattern: RegExp;
  databases: string[];
  searchTerms: string[];
  reason: string;
  /** 规则层默认候选表（元数据搜索失败时仍可规划） */
  suggestedTables?: Array<{ database: string; table: string }>;
};

/** 自然语言问题 → 候选库 / 搜索词（规则层，供工具与 mock 共用） */
export const questionRouteRules: RouteKeywordRule[] = [
  {
    pattern:
      /客户(?:信息|资料|详情)?|用户(?:信息|资料|详情)?|车牛用户|客户\s*id|用户\s*id|user_id|dfc_user_id|cheniu_user/i,
    databases: ["matador", "danube_member"],
    searchTerms: ["cheniu_user", "user", "member", "customer"],
    suggestedTables: [{ database: "matador", table: "cheniu_user" }],
    reason: "客户/用户信息查询语义",
  },
  {
    pattern: /会员|会员中心|member/,
    databases: ["danube_member"],
    searchTerms: ["member", "user", "vip", "membership"],
    suggestedTables: [
      { database: "danube_member", table: "membership_personal_information" },
    ],
    reason: "会员相关语义",
  },
  {
    pattern: /找车源|topcars|撮合车源/,
    databases: ["danube_topcars", "matador"],
    searchTerms: ["car", "source", "top"],
    reason: "找车源语义",
  },
  {
    pattern: /二手车市场|usedcar|市场车源/,
    databases: ["danube_usedcar_market", "matador"],
    searchTerms: ["car", "market", "goods"],
    reason: "二手车市场语义",
  },
  {
    pattern: /服务市场|商品交易|service.?market/,
    databases: ["danube_service_market"],
    searchTerms: ["order", "goods", "sku", "product"],
    reason: "服务市场语义",
  },
  {
    pattern: /金融|贷款|分期|mammon|放款/,
    databases: ["danube_mammon"],
    searchTerms: ["loan", "order", "finance", "fund"],
    reason: "金融语义",
  },
  {
    pattern: /电子合同|合同|签章|contract/,
    databases: ["danube_electronic_contract"],
    searchTerms: ["contract", "sign", "agreement"],
    reason: "电子合同语义",
  },
  {
    pattern: /联盟|league/,
    databases: ["danube_league", "souche_league"],
    searchTerms: ["league", "partner", "alliance"],
    reason: "联盟语义",
  },
  {
    pattern: /成交适配|deal.?adapter/,
    databases: ["danube_deal_adapter", "matador"],
    searchTerms: ["deal", "adapter", "order"],
    reason: "成交适配语义",
  },
  {
    pattern: /活动中心|运营活动|activity/,
    databases: ["danube-activity-center"],
    searchTerms: ["activity", "campaign", "event"],
    reason: "活动语义",
  },
  {
    pattern: /统计报表|报表脚本|report.?script|数据统计/,
    databases: ["danube_statistics", "danube_report_script", "danube_report_script_web"],
    searchTerms: ["report", "stat", "metric"],
    reason: "统计报表语义",
  },
  {
    pattern: /状态机|statemachine/,
    databases: ["danube_statemachine"],
    searchTerms: ["state", "machine", "flow"],
    reason: "状态机语义",
  },
  {
    pattern: /求购|线索|buy_car|意向买车/,
    databases: ["matador"],
    searchTerms: ["buy", "lead", "clue"],
    suggestedTables: [{ database: "matador", table: "buy_car" }],
    reason: "求购线索语义",
  },
  {
    pattern: /订单|成交|交易单|main_order/,
    databases: ["matador", "danube_deal_adapter"],
    searchTerms: ["order", "deal", "trade"],
    suggestedTables: [{ database: "matador", table: "main_order" }],
    reason: "订单成交语义",
  },
  {
    pattern: /车源|在售|库存车辆|正式车|car_status|operate_report|运营日报|pv|uv/,
    databases: ["matador"],
    searchTerms: ["car", "operate", "report"],
    suggestedTables: [{ database: "matador", table: "car" }],
    reason: "核心车源/运营语义",
  },
  {
    pattern: /super.?mario|超级玛丽/,
    databases: ["super_mario"],
    searchTerms: ["mario", "task", "job"],
    reason: "super_mario 语义",
  },
];

/** 从自然语言中提取「按 ID 查详情」的业务 ID */
export function extractLookupId(question: string): string | undefined {
  const normalized = question.trim();
  const match =
    normalized.match(
      /(?:客户|用户|会员)(?:\s*(?:id|ID|Id))?\s*(?:为|是|=|：|:)\s*['"`]?([a-zA-Z0-9_-]{2,64})/,
    ) ??
    normalized.match(
      /(?:user_id|dfc_user_id|member_id|customer_id)\s*(?:为|是|=|：|:)?\s*['"`]?([a-zA-Z0-9_-]{2,64})/i,
    ) ??
    normalized.match(
      /id\s*(?:为|是|=|：|:)\s*['"`]?([a-zA-Z0-9_-]{2,64})/i,
    );

  return match?.[1];
}

export function suggestedTablesForQuestion(question: string) {
  const tables: Array<{ database: string; table: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const rule of questionRouteRules) {
    if (!rule.pattern.test(question) || !rule.suggestedTables?.length) {
      continue;
    }
    for (const item of rule.suggestedTables) {
      const key = `${item.database}.${item.table}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      tables.push({ ...item, reason: rule.reason });
    }
  }

  return tables;
}

const STOP_WORDS = new Set([
  "的",
  "了",
  "吗",
  "呢",
  "啊",
  "是",
  "有",
  "和",
  "与",
  "在",
  "为",
  "对",
  "把",
  "被",
  "到",
  "从",
  "请",
  "帮",
  "我",
  "看",
  "下",
  "一下",
  "多少",
  "几个",
  "什么",
  "哪些",
  "怎么",
  "如何",
  "统计",
  "查询",
  "分析",
  "数据",
  "一共",
  "总共",
]);

export function extractQuestionSearchTerms(question: string): string[] {
  const terms = new Set<string>();
  const normalized = question.trim();

  for (const rule of questionRouteRules) {
    if (rule.pattern.test(normalized)) {
      for (const term of rule.searchTerms) {
        terms.add(term);
      }
    }
  }

  const latin = normalized.match(/[a-zA-Z][a-zA-Z0-9_]{1,32}/g) ?? [];
  for (const token of latin) {
    if (token.length >= 2) {
      terms.add(token.toLowerCase());
    }
  }

  const cnChunks = normalized.match(/[\u4e00-\u9fff]{2,8}/g) ?? [];
  for (const chunk of cnChunks) {
    if (!STOP_WORDS.has(chunk)) {
      terms.add(chunk);
    }
  }

  return [...terms].slice(0, 8);
}

export function rankDatabasesForQuestion(question: string): Array<{
  database: string;
  score: number;
  reasons: string[];
  entry?: ProjectDatabaseEntry;
}> {
  const preferred = getPreferredAnalyticsDatabase();
  const scores = new Map<string, { score: number; reasons: string[] }>();

  const bump = (database: string, score: number, reason: string) => {
    const current = scores.get(database) ?? { score: 0, reasons: [] };
    current.score += score;
    if (!current.reasons.includes(reason)) {
      current.reasons.push(reason);
    }
    scores.set(database, current);
  };

  for (const rule of questionRouteRules) {
    if (rule.pattern.test(question)) {
      rule.databases.forEach((database, index) => {
        bump(database, 10 - index, rule.reason);
      });
    }
  }

  for (const entry of dfcProjectDatabaseRegistry) {
    if (question.toLowerCase().includes(entry.name.toLowerCase())) {
      bump(entry.name, 20, `问题中直接提到库名 ${entry.name}`);
    }
    if (question.includes(entry.description.slice(0, 4))) {
      bump(entry.name, 3, `描述关键词命中 ${entry.name}`);
    }
  }

  if (preferred) {
    bump(preferred, 4, "会话偏好库加权");
  }

  // 无命中时兜底核心库，保证总能给出探索起点
  if (![...scores.values()].some((item) => item.score >= 8)) {
    bump("matador", 5, "未明确命中时默认探索核心库 matador");
  }

  const allowed = new Set(
    filterAllowedDatabaseNames([...scores.keys()]).map((name) => name.toLowerCase()),
  );

  return [...scores.entries()]
    .filter(([database]) => allowed.has(database.toLowerCase()))
    .map(([database, value]) => ({
      database,
      score: value.score,
      reasons: value.reasons,
      entry: dfcProjectDatabaseRegistry.find((item) => item.name === database),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export function formatRouteHintForPrompt() {
  return questionRouteRules
    .map((rule) => {
      const tables = rule.suggestedTables
        ?.map((item) => `${item.database}.${item.table}`)
        .join(", ");
      return `- /${rule.pattern.source}/ → ${rule.databases.join(", ")}${
        tables ? `｜建议表 ${tables}` : ""
      }（搜索词：${rule.searchTerms.join(", ")}）`;
    })
    .join("\n");
}

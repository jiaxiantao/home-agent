import {
  dfcProjectDatabaseRegistry,
  matchRegistryKeywords,
  type ProjectDatabaseEntry,
} from "@/lib/analytics/project-databases";
import { matchBusinessEntities } from "@/lib/analytics/business-glossary";
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
      /用户(?:信息|资料|详情)?|车牛用户|用户\s*id|user_id|dfc_user_id|cheniu_user/i,
    databases: ["matador", "cheniu_user"],
    searchTerms: ["cheniu_user", "user", "member"],
    suggestedTables: [{ database: "matador", table: "cheniu_user" }],
    reason: "车牛/大风车用户信息语义",
  },
  {
    pattern: /客户.*(?:手机|电话|微信)|(?:手机|电话|微信).*客户/,
    databases: ["super_mario"],
    searchTerms: ["customer", "phone", "weichat", "crm"],
    suggestedTables: [{ database: "super_mario", table: "customer" }],
    reason: "CRM 客户按手机号/微信号查询",
  },
  {
    pattern: /crm|客户档案|客户管理|跟进记录|客户关怀|门店客户|super.?mario/i,
    databases: ["super_mario"],
    searchTerms: ["customer", "follow", "care", "crm"],
    suggestedTables: [{ database: "super_mario", table: "customer" }],
    reason: "CRM 客户管理语义",
  },
  {
    pattern: /客户(?:信息|资料|详情)?|客户\s*id/i,
    databases: ["super_mario", "matador"],
    searchTerms: ["customer", "cheniu_user", "user"],
    suggestedTables: [
      { database: "super_mario", table: "customer" },
      { database: "matador", table: "cheniu_user" },
    ],
    reason: "客户查询语义（CRM 客户 vs 车牛用户，需结合上下文）",
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
    pattern: /求购|buy_car|意向买车/,
    databases: ["matador"],
    searchTerms: ["buy", "lead", "clue"],
    suggestedTables: [{ database: "matador", table: "buy_car" }],
    reason: "求购线索语义",
  },
  {
    pattern: /线索分发|线索池|maple.?story/,
    databases: ["maple_story", "matador"],
    searchTerms: ["lead", "clue", "distribute"],
    reason: "线索分发语义",
  },
  {
    pattern: /scrm|私域运营|营销scrm/,
    databases: ["marketing_scrm"],
    searchTerms: ["scrm", "customer", "wechat", "tag"],
    reason: "SCRM 语义",
  },
  {
    pattern: /客户管理|跟进记录|super.?mario|超级玛丽/,
    databases: ["super_mario"],
    searchTerms: ["customer", "follow", "crm", "mario"],
    reason: "客户管理语义",
  },
  {
    pattern: /企业微信|企微|anduin/,
    databases: ["anduin"],
    searchTerms: ["wecom", "corp", "contact", "department"],
    reason: "企业微信语义",
  },
  {
    pattern: /消息推送|arche.?blade/,
    databases: ["arche_blade"],
    searchTerms: ["push", "message", "template"],
    reason: "消息推送语义",
  },
  {
    pattern: /车辆管理|crazy.?kartrider/,
    databases: ["crazy_kartrider", "matador"],
    searchTerms: ["vehicle", "car", "manage"],
    reason: "车辆管理语义",
  },
  {
    pattern: /检测业务|车况检测|souche.?detect|detect.?business/,
    databases: ["souche_detect", "detect_business"],
    searchTerms: ["detect", "inspect", "report"],
    reason: "检测语义",
  },
  {
    pattern: /订单管理|rich.?man/,
    databases: ["rich_man", "matador"],
    searchTerms: ["order", "rich"],
    reason: "订单管理语义",
  },
  {
    pattern: /b2b|suez/,
    databases: ["suez"],
    searchTerms: ["b2b", "trade", "order"],
    reason: "B2B 交易语义",
  },
  {
    pattern: /任务管理|glorious.?mission/,
    databases: ["glorious_mission"],
    searchTerms: ["task", "mission", "job"],
    reason: "任务管理语义",
  },
  {
    pattern: /微店|花果|huaguo/,
    databases: ["jiaxuan_huaguo"],
    searchTerms: ["shop", "store", "goods"],
    reason: "微店/花果语义",
  },
  {
    pattern: /工作台|jiaxuan.?sword/,
    databases: ["jiaxuan_sword"],
    searchTerms: ["workbench", "entry", "menu"],
    reason: "工作台入口语义",
  },
  {
    pattern: /营销推送|souche.?cannon/,
    databases: ["souche_cannon"],
    searchTerms: ["marketing", "push", "campaign"],
    reason: "营销推送语义",
  },
  {
    pattern: /配置服务|配置中心|souche.?lute/,
    databases: ["souche_lute"],
    searchTerms: ["config", "setting", "lute"],
    reason: "配置服务语义",
  },
  {
    pattern: /定制对象|danube.?chaos/,
    databases: ["danube_chaos"],
    searchTerms: ["custom", "object", "field"],
    reason: "定制对象语义",
  },
  {
    pattern: /节点漫游|danube.?roam/,
    databases: ["danube_roam"],
    searchTerms: ["roam", "node", "route"],
    reason: "节点漫游语义",
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

  for (const match of matchRegistryKeywords(question)) {
    bump(match.database, 6, `登记关键词「${match.keyword}」→ ${match.database}`);
  }

  for (const entity of matchBusinessEntities(question)) {
    bump(entity.database, 12, `业务实体「${entity.table}」→ ${entity.database}`);
  }

  if (preferred) {
    bump(preferred, 4, "用户指定偏好库加权");
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

export function formatRouteHintForPrompt(question?: string) {
  const rules = question
    ? questionRouteRules.filter((rule) => rule.pattern.test(question))
    : questionRouteRules;

  const selected = rules.length > 0 ? rules : questionRouteRules.slice(0, 10);

  return selected
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

/**
 * 大风车业务实体口径（Agent 规划用）。
 * 来源：DBHub 真实表结构 + gourd/super-mario、dafengche-txqsr 产品文档。
 */

export type BusinessEntity = {
  /** 用户口语中的叫法 */
  terms: string[];
  /** 优先库 */
  database: string;
  /** 主表 */
  table: string;
  /** 按 ID 查时的字段候选（按优先级） */
  idColumns: string[];
  description: string;
  /** 常用过滤条件 */
  filters?: string[];
  /** 与相近实体的区分说明 */
  disambiguation?: string;
};

/** 大风车核心实体 → 库表映射（消歧义） */
export const dfcBusinessEntities: BusinessEntity[] = [
  {
    terms: ["车牛用户", "大风车用户", "用户信息", "用户资料", "dfc_user_id", "user_id"],
    database: "matador",
    table: "cheniu_user",
    idColumns: ["user_id", "dfc_user_id", "phone"],
    description: "车牛/大风车 C 端用户账号（注册、实名、手机）",
    filters: ["date_delete IS NULL"],
    disambiguation:
      "问「用户 id / 车牛用户 / dfc_user_id」时用此表；不是 CRM 客户档案（super_mario.customer）",
  },
  {
    terms: ["CRM客户", "客户档案", "客户管理", "跟进记录", "客户关怀", "门店客户"],
    database: "super_mario",
    table: "customer",
    idColumns: ["id", "phone", "shop_code"],
    description: "大风车 CRM 客户档案（门店销售跟进、负责人 owner）",
    disambiguation:
      "问「客户管理 / 跟进 / 客户档案 / 门店客户」时用此表；id 为 varchar 主键，非 user_id",
  },
  {
    terms: ["会员", "会员中心", "VIP", "个人会员"],
    database: "danube_member",
    table: "membership_personal_information",
    idColumns: ["user_id", "member_id"],
    description: "大风车会员身份信息与权益",
    disambiguation: "问「会员等级 / 会员权益 / 积分」时用 danube_member，不是 matador 用户表",
  },
  {
    terms: ["正式车源", "operate_report", "运营日报"],
    database: "matador",
    table: "car",
    idColumns: ["car_id", "id", "license_number", "vin"],
    description: "matador 正式车源主表（test_type=0）；不是门店车辆管理库存",
    filters: ["test_type = 0"],
    disambiguation:
      "仅当问题明确「正式车源 / 运营日报」时用 matador.car；门店在售/库存/车牌用 crazy_kartrider.car。售价在 matador.car.sale_price（分），不在 car_extra",
  },
  {
    terms: ["车辆管理", "车牌", "车牌号", "车辆信息", "查车辆", "在售车辆", "库存车", "门店库存"],
    database: "crazy_kartrider",
    table: "car",
    idColumns: ["id", "plate_number", "vin_number"],
    description: "门店车辆管理主表（crazyracing-kartrider）",
    filters: ["date_delete = 0"],
    disambiguation:
      "按车牌查车用 plate_number；门店在售/库存优先此表，不是 matador.car",
  },
  {
    terms: ["求购", "买车意向", "求购线索"],
    database: "matador",
    table: "buy_car",
    idColumns: ["buy_id", "user_id"],
    description: "求购线索表",
    filters: ["test_type = 0"],
  },
  {
    terms: ["主订单", "main_order"],
    database: "matador",
    table: "main_order",
    idColumns: ["main_order_id", "id"],
    description: "大风车成交主订单",
    filters: ["delete_time IS NULL"],
  },
  {
    terms: ["找车源", "topcars", "撮合车源"],
    database: "danube_topcars",
    table: "car_source",
    idColumns: ["id"],
    description: "找车源业务（danube_topcars 库）",
  },
  {
    terms: ["SCRM", "私域", "营销SCRM"],
    database: "marketing_scrm",
    table: "customer",
    idColumns: ["id"],
    description: "营销 SCRM 私域客户（与 super_mario CRM 不同域）",
    disambiguation: "问「SCRM / 私域 / 企微标签」时用 marketing_scrm",
  },
  {
    terms: ["线索分发", "线索池"],
    database: "maple_story",
    table: "lead",
    idColumns: ["id"],
    description: "线索分发池（maple_story 库）",
  },
];

export function matchBusinessEntities(question: string): BusinessEntity[] {
  const normalized = question.trim();
  const hits: BusinessEntity[] = [];

  for (const entity of dfcBusinessEntities) {
    const matched = entity.terms.some(
      (term) =>
        normalized.includes(term) ||
        normalized.toLowerCase().includes(term.toLowerCase()),
    );
    if (matched) {
      hits.push(entity);
    }
  }

  return hits;
}

export function formatBusinessGlossaryForPrompt(question?: string) {
  const entities = question ? matchBusinessEntities(question) : dfcBusinessEntities;

  const selected =
    entities.length > 0 && question
      ? entities
      : dfcBusinessEntities.slice(0, 6);

  return selected
    .map(
      (entity) =>
        `- 「${entity.terms.slice(0, 3).join("/")}」→ \`${entity.database}\`.\`${entity.table}\`（ID 字段：${entity.idColumns.join(" / ")}）${entity.filters?.length ? `｜常用：${entity.filters.join(" AND ")}` : ""}${entity.disambiguation ? `｜${entity.disambiguation}` : ""}`,
    )
    .join("\n");
}

/** GitLab 仓库与 DB 映射（供规划器理解服务边界） */
export const dfcServiceRepoMap: Array<{
  repo: string;
  database: string;
  description: string;
}> = [
  { repo: "gourd/super-mario", database: "super_mario", description: "CRM 客户管理" },
  { repo: "danube/danube-member", database: "danube_member", description: "会员体系" },
  { repo: "danube/danube-topcars", database: "danube_topcars", description: "找车源" },
  { repo: "danube/danube-service-market", database: "danube_service_market", description: "服务市场" },
  { repo: "danube/danube-chaos", database: "danube_chaos", description: "定制对象/评估" },
  { repo: "danube/danube-league", database: "danube_league", description: "联盟" },
];

export function formatServiceRepoMapForPrompt() {
  return dfcServiceRepoMap
    .map((item) => `- ${item.repo} → ${item.database}（${item.description}）`)
    .join("\n");
}

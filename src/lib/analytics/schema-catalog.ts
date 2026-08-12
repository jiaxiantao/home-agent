export type SchemaColumn = {
  name: string;
  type: string;
  description: string;
};

export type SchemaTable = {
  name: string;
  /** 所属业务库（口径元数据，不是连接默认库） */
  database: string;
  domain: "car" | "trade" | "lead" | "ops" | "user" | "crm" | "member";
  description: string;
  columns: SchemaColumn[];
  notes?: string[];
};

/** 大风车业务表目录（手写口径；Agent 按问题语义选库，连接层不绑定默认库） */
export const analyticsSchemaCatalog: SchemaTable[] = [
  {
    name: "car",
    database: "matador",
    domain: "car",
    description: "车源主表：库存车辆信息",
    columns: [
      { name: "id", type: "bigint", description: "自增主键" },
      { name: "car_id", type: "varchar", description: "车源业务 ID" },
      { name: "user_id", type: "varchar", description: "车商/用户 ID" },
      { name: "brand_name", type: "varchar", description: "品牌名" },
      { name: "series_name", type: "varchar", description: "车系名" },
      { name: "model_name", type: "varchar", description: "车型名" },
      { name: "car_status", type: "int", description: "车源状态（如 1=在售）" },
      { name: "car_type", type: "int", description: "车源类型" },
      { name: "car_source", type: "int", description: "车源来源" },
      { name: "test_type", type: "int", description: "0=正式数据，非0可能为测试" },
      { name: "display_mileage", type: "decimal", description: "表显里程" },
      { name: "car_city_name", type: "varchar", description: "车辆所在城市" },
      { name: "car_province_name", type: "varchar", description: "车辆所在省份" },
      { name: "date_create", type: "datetime", description: "创建时间" },
      { name: "date_update", type: "datetime", description: "更新时间" },
    ],
    notes: [
      "统计正式车源时常用 test_type = 0",
      "在售常用 car_status = 1（具体枚举以业务为准）",
    ],
  },
  {
    name: "car_extra",
    database: "matador",
    domain: "car",
    description: "车源扩展信息",
    columns: [
      { name: "car_id", type: "varchar", description: "关联 car.car_id" },
      { name: "sale_price", type: "decimal", description: "售价（如有）" },
    ],
  },
  {
    name: "main_order",
    database: "matador",
    domain: "trade",
    description: "主订单表",
    columns: [
      { name: "id", type: "int", description: "主键" },
      { name: "main_order_id", type: "varchar", description: "主订单号" },
      { name: "deal_date", type: "varchar", description: "成交日期" },
      { name: "create_time", type: "datetime", description: "创建时间" },
      { name: "update_time", type: "datetime", description: "更新时间" },
      { name: "delete_time", type: "datetime", description: "软删时间，查询需 IS NULL" },
    ],
    notes: ["查询有效订单加 delete_time IS NULL"],
  },
  {
    name: "common_order",
    database: "matador",
    domain: "trade",
    description: "普通订单明细",
    columns: [
      { name: "id", type: "bigint", description: "主键" },
      { name: "order_id", type: "varchar", description: "订单号" },
      { name: "main_order_id", type: "varchar", description: "关联主订单" },
      { name: "create_time", type: "datetime", description: "创建时间" },
    ],
  },
  {
    name: "car_deal",
    database: "matador",
    domain: "trade",
    description: "车辆成交记录",
    columns: [
      { name: "id", type: "bigint", description: "主键" },
      { name: "car_id", type: "varchar", description: "车源 ID" },
      { name: "create_time", type: "datetime", description: "成交/创建时间" },
    ],
  },
  {
    name: "buy_car",
    database: "matador",
    domain: "lead",
    description: "求购线索",
    columns: [
      { name: "id", type: "bigint", description: "主键" },
      { name: "buy_id", type: "varchar", description: "求购业务 ID" },
      { name: "user_id", type: "varchar", description: "用户 ID" },
      { name: "brand_name", type: "varchar", description: "意向品牌" },
      { name: "series_name", type: "varchar", description: "意向车系" },
      { name: "city_name", type: "varchar", description: "城市" },
      { name: "status", type: "int", description: "求购状态" },
      { name: "test_type", type: "int", description: "0=正式" },
      { name: "date_create", type: "datetime", description: "创建时间" },
    ],
  },
  {
    name: "buy_call",
    database: "matador",
    domain: "lead",
    description: "求购相关通话记录",
    columns: [
      { name: "id", type: "bigint", description: "主键" },
      { name: "buy_id", type: "varchar", description: "求购 ID" },
      { name: "date_create", type: "datetime", description: "创建时间" },
    ],
  },
  {
    name: "cheniu_user",
    database: "matador",
    domain: "user",
    description: "车牛/大风车用户主表（客户信息）",
    columns: [
      { name: "id", type: "int", description: "自增主键" },
      { name: "user_id", type: "varchar", description: "用户业务 ID" },
      { name: "dfc_user_id", type: "varchar", description: "大风车用户 ID" },
      { name: "phone", type: "varchar", description: "手机号" },
      { name: "name", type: "varchar", description: "昵称" },
      { name: "area", type: "varchar", description: "省市区" },
      { name: "address", type: "varchar", description: "详细地址" },
      { name: "is_auth", type: "tinyint", description: "是否实名 1/0" },
      { name: "app_source", type: "int", description: "注册来源" },
      { name: "date_create", type: "datetime", description: "创建时间" },
      { name: "date_delete", type: "datetime", description: "软删时间" },
    ],
    notes: [
      "按客户/用户 ID 查询优先：user_id 或 dfc_user_id",
      "正式记录通常 date_delete IS NULL",
    ],
  },
  {
    name: "operate_report",
    database: "matador",
    domain: "ops",
    description: "运营日报指标",
    columns: [
      { name: "id", type: "int", description: "主键" },
      { name: "report_date", type: "date", description: "报表日期" },
      { name: "car_new", type: "int", description: "新增车源" },
      { name: "car_all", type: "int", description: "车源总量指标" },
      { name: "buy_new", type: "int", description: "新增求购" },
      { name: "buy_all", type: "int", description: "求购总量指标" },
      { name: "pv", type: "int", description: "PV" },
      { name: "uv", type: "int", description: "UV" },
      { name: "date_create", type: "datetime", description: "写入时间" },
    ],
  },
  {
    name: "customer",
    database: "super_mario",
    domain: "crm",
    description: "CRM 客户档案（门店销售跟进）",
    columns: [
      { name: "id", type: "varchar(80)", description: "CRM 客户主键" },
      { name: "owner", type: "varchar(20)", description: "负责人" },
      { name: "shop_code", type: "varchar(50)", description: "门店 lookup" },
      { name: "phone", type: "varchar(100)", description: "手机号" },
      { name: "name", type: "varchar(255)", description: "客户姓名" },
      { name: "source", type: "varchar(80)", description: "来源" },
      { name: "org_id", type: "varchar(20)", description: "组织 ID" },
      { name: "department_id", type: "varchar(50)", description: "部门 ID" },
    ],
    notes: [
      "与 matador.cheniu_user 不同：这是 CRM 客户档案，id 为 varchar",
      "问「客户管理 / 跟进 / 客户档案」优先此表",
    ],
  },
  {
    name: "membership_personal_information",
    database: "danube_member",
    domain: "member",
    description: "个人会员身份信息",
    columns: [
      { name: "id", type: "bigint", description: "主键" },
      { name: "user_id", type: "varchar", description: "用户 ID" },
      { name: "member_type_id", type: "bigint", description: "会员类型" },
      { name: "status", type: "int", description: "会员状态" },
      { name: "expire_time", type: "datetime", description: "到期时间" },
    ],
    notes: ["问「会员 / VIP」优先 danube_member 库"],
  },
];

export function formatSchemaCatalogForPrompt(
  tables = analyticsSchemaCatalog,
  question?: string,
) {
  const filtered = question
    ? tables.filter((table) => {
        const db = table.database;
        const haystack = `${question} ${db} ${table.name} ${table.description}`.toLowerCase();
        return (
          haystack.includes(table.name.toLowerCase()) ||
          question.includes(table.description.slice(0, 4)) ||
          question.toLowerCase().includes(db.toLowerCase()) ||
          (table.domain === "car" && /车源|在售|库存/.test(question)) ||
          (table.domain === "crm" && /客户管理|crm|跟进|客户档案/.test(question)) ||
          (table.domain === "member" && /会员/.test(question)) ||
          (table.domain === "user" && /用户|车牛/.test(question))
        );
      })
    : tables;

  const selected = filtered.length > 0 ? filtered : tables.slice(0, 8);

  return selected
    .map((table) => {
      const db = table.database;
      const cols = table.columns
        .map((col) => `  - ${col.name} (${col.type}): ${col.description}`)
        .join("\n");
      const notes = table.notes?.length
        ? `\n注意: ${table.notes.join("；")}`
        : "";
      return `库 ${db} · 表 ${table.name} [${table.domain}] — ${table.description}\n${cols}${notes}`;
    })
    .join("\n\n");
}

export function listSchemaSummary() {
  return analyticsSchemaCatalog.map((table) => ({
    name: table.name,
    database: table.database,
    domain: table.domain,
    description: table.description,
    columns: table.columns.map((col) => col.name),
  }));
}

export type SchemaColumn = {
  name: string;
  type: string;
  description: string;
};

export type SchemaTable = {
  name: string;
  domain: "car" | "trade" | "lead" | "ops";
  description: string;
  columns: SchemaColumn[];
  notes?: string[];
};

/** 大风车 matador 测试库核心表目录（手写，供 NL→SQL 规划） */
export const analyticsSchemaCatalog: SchemaTable[] = [
  {
    name: "car",
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
    domain: "car",
    description: "车源扩展信息",
    columns: [
      { name: "car_id", type: "varchar", description: "关联 car.car_id" },
      { name: "sale_price", type: "decimal", description: "售价（如有）" },
    ],
  },
  {
    name: "main_order",
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
    domain: "lead",
    description: "求购相关通话记录",
    columns: [
      { name: "id", type: "bigint", description: "主键" },
      { name: "buy_id", type: "varchar", description: "求购 ID" },
      { name: "date_create", type: "datetime", description: "创建时间" },
    ],
  },
  {
    name: "operate_report",
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
];

export function formatSchemaCatalogForPrompt(tables = analyticsSchemaCatalog) {
  return tables
    .map((table) => {
      const cols = table.columns
        .map((col) => `  - ${col.name} (${col.type}): ${col.description}`)
        .join("\n");
      const notes = table.notes?.length
        ? `\n注意: ${table.notes.join("；")}`
        : "";
      return `表 ${table.name} [${table.domain}] — ${table.description}\n${cols}${notes}`;
    })
    .join("\n\n");
}

export function listSchemaSummary() {
  return analyticsSchemaCatalog.map((table) => ({
    name: table.name,
    domain: table.domain,
    description: table.description,
    columns: table.columns.map((col) => col.name),
  }));
}

/** 产品品牌：大风车数据分析助手 / DFC Data Agent */
export const PRODUCT_NAME_ZH = "大风车数据分析助手";
export const PRODUCT_NAME_EN = "DFC Data Agent";
/** npm / K8s / Redis 等技术标识（kebab-case） */
export const PRODUCT_SLUG = "dfc-data-agent";
export const PRODUCT_TAGLINE =
  "自然语言问数 · Agent 自动规划库与表 · 确认后出数";
export const PRODUCT_MISSION =
  "用户只需用自然语言描述要查的数据；Agent 主动规划数据库、表与查询条件，生成只读 SQL 供用户确认执行，无需手动选库选表。";

export function productTitle(page?: string) {
  return page
    ? `${page} · ${PRODUCT_NAME_EN}`
    : `${PRODUCT_NAME_ZH} · ${PRODUCT_NAME_EN}`;
}

/** 搜车橙 / 大风车品牌主题（与 globals.css --brand 保持一致） */
export const BRAND_HEX = {
  primary: "#ff6600",
  hover: "#ff8533",
  soft: "#ffb380",
  deep: "#cc5200",
  light: "#ffa64d",
} as const;

/** Recharts / 图表色板 */
export const BRAND_CHART_COLORS = [
  BRAND_HEX.primary,
  BRAND_HEX.hover,
  BRAND_HEX.soft,
  BRAND_HEX.light,
  BRAND_HEX.deep,
  "#ffad33",
] as const;

/** 选中态圆点（环境/库切换等） */
export const radioSelectedClass =
  "border-brand bg-brand text-white";

export const radioUnselectedClass =
  "border-border-strong text-transparent";

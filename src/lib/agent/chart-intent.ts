import {
  CHART_INTENT_KEYWORDS,
  type ChartType,
  pickChartTypeFromText,
} from "@/lib/analytics/chart-types";

const GENERIC_CHART_INTENT =
  /(?:图表|统计图|可视化|趋势图|分布图|画(?:个|一)?图|绘制(?:图表|统计图)?|用图(?:表)?(?:展示|看|显示)|生成(?:相关)?图(?:表)?|做成图(?:表)?|出(?:个)?图(?:表)?|以图(?:表)?(?:展示|呈现)|\bchart\b|\bgraph\b|visuali[sz]e|\bplot\b)/iu;

const TYPE_INTENT_PATTERN = new RegExp(
  CHART_INTENT_KEYWORDS.map((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return /^[\x00-\x7F]+$/.test(keyword)
      ? `\\b${escaped.replace(/ /g, "\\s+")}\\b`
      : escaped;
  }).join("|"),
  "iu",
);

export function userRequestedChart(message: string): boolean {
  const text = message.trim();
  if (!text) {
    return false;
  }

  return GENERIC_CHART_INTENT.test(text) || TYPE_INTENT_PATTERN.test(text);
}

export function inferPreferredChartType(message: string): ChartType {
  return pickChartTypeFromText(message.trim()) ?? "bar";
}

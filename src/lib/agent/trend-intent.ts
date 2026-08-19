import type { ChartType } from "@/lib/analytics/chart-types";

export type TrendIntent =
  | { kind: "comparison"; period: string; vsLabel: string }
  | { kind: "trend"; groupBy: "day" | "week" | "month"; periods?: number }
  | null;

const COMPARISON_PATTERNS: Array<{
  pattern: RegExp;
  period: string;
  vsLabel: string;
}> = [
  { pattern: /本月\s*(?:vs|对比|比较?|与)\s*上月/i, period: "month", vsLabel: "本月 vs 上月" },
  { pattern: /上月\s*(?:vs|对比|比较?|与)\s*本月/i, period: "month", vsLabel: "本月 vs 上月" },
  { pattern: /本周\s*(?:vs|对比|比较?|与)\s*上周/i, period: "week", vsLabel: "本周 vs 上周" },
  { pattern: /今天\s*(?:vs|对比|比较?|与)\s*昨天/i, period: "day", vsLabel: "今天 vs 昨天" },
  { pattern: /(?:环比|同比|对比|比较)/, period: "auto", vsLabel: "环比对比" },
];

const TREND_PATTERNS: Array<{
  pattern: RegExp;
  groupBy: "day" | "week" | "month";
}> = [
  { pattern: /(?:按天|每天|日(?:趋势|变化)|逐日|daily)/i, groupBy: "day" },
  { pattern: /(?:按周|每周|周趋势|weekly)/i, groupBy: "week" },
  { pattern: /(?:按月|每月|月趋势|monthly|月度)/i, groupBy: "month" },
  { pattern: /趋势|走势|变化|增长|下降/, groupBy: "day" },
];

export function detectTrendIntent(question: string): TrendIntent {
  const text = question.trim();

  for (const { pattern, period, vsLabel } of COMPARISON_PATTERNS) {
    if (pattern.test(text)) {
      return { kind: "comparison", period, vsLabel };
    }
  }

  for (const { pattern, groupBy } of TREND_PATTERNS) {
    if (pattern.test(text)) {
      return { kind: "trend", groupBy };
    }
  }

  return null;
}

export function inferTrendChartType(intent: TrendIntent): ChartType {
  if (!intent) return "bar";
  if (intent.kind === "comparison") return "groupedBar";
  return "line";
}

export function buildTrendPromptHint(intent: TrendIntent): string {
  if (!intent) return "";

  if (intent.kind === "comparison") {
    return `用户意图：「${intent.vsLabel}」。请生成包含两个时间段的 SQL，结果集应包含 period 列标识不同时段，便于分组柱状图展示。可使用 UNION ALL 或 CASE WHEN 实现。`;
  }

  const groupLabel = { day: "天", week: "周", month: "月" }[intent.groupBy];
  return `用户意图：按${groupLabel}查看趋势。SQL 应包含 DATE_FORMAT 或 DATE() 生成时间分组列，结果按时间排序，便于折线图展示。`;
}

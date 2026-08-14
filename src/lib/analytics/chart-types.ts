export const CHART_TYPES = [
  "bar",
  "groupedBar",
  "stackedBar",
  "horizontalBar",
  "histogram",
  "waterfall",
  "line",
  "area",
  "stackedArea",
  "stepLine",
  "pie",
  "doughnut",
  "rose",
  "funnel",
  "radar",
  "scatter",
  "bubble",
  "treemap",
  "sunburst",
  "sankey",
  "radialBar",
  "composed",
  "candlestick",
  "gauge",
  "heatmap",
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_TYPE_SET = new Set<string>(CHART_TYPES);

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: "柱状图",
  groupedBar: "分组柱状图",
  stackedBar: "堆积柱状图",
  horizontalBar: "条形图",
  histogram: "直方图",
  waterfall: "瀑布图",
  line: "折线图",
  area: "面积图",
  stackedArea: "堆积面积图",
  stepLine: "阶梯图",
  pie: "饼图",
  doughnut: "环形图",
  rose: "玫瑰图",
  funnel: "漏斗图",
  radar: "雷达图",
  scatter: "散点图",
  bubble: "气泡图",
  treemap: "矩形树图",
  sunburst: "旭日图",
  sankey: "桑基图",
  radialBar: "径向柱图",
  composed: "组合图",
  candlestick: "K线图",
  gauge: "仪表盘",
  heatmap: "热力图",
};

type ChartTypeDef = {
  type: ChartType;
  patterns: string[];
};

/** 更具体的图形名放在前面，便于文档与测试枚举；匹配时按「结束位置 + 词长」择优 */
export const CHART_TYPE_DEFS: ChartTypeDef[] = [
  { type: "candlestick", patterns: ["K线图", "蜡烛图", "K线", "candlestick", "k-line", "kline"] },
  { type: "heatmap", patterns: ["热力图", "heatmap"] },
  { type: "sankey", patterns: ["桑基图", "sankey"] },
  { type: "sunburst", patterns: ["旭日图", "sunburst"] },
  { type: "treemap", patterns: ["矩形树图", "树状图", "树图", "treemap"] },
  { type: "radar", patterns: ["雷达图", "蜘蛛图", "radar"] },
  { type: "gauge", patterns: ["仪表盘", "仪表图", "gauge"] },
  { type: "waterfall", patterns: ["瀑布图", "waterfall"] },
  { type: "histogram", patterns: ["直方图", "histogram"] },
  { type: "doughnut", patterns: ["环形图", "环图", "doughnut", "donut"] },
  { type: "rose", patterns: ["玫瑰图", "南丁格尔", "rose chart"] },
  { type: "bubble", patterns: ["气泡图", "bubble"] },
  { type: "scatter", patterns: ["散点图", "scatter"] },
  { type: "stackedArea", patterns: ["堆积面积图", "堆叠面积图", "stacked area"] },
  { type: "stackedBar", patterns: ["堆积柱状图", "堆叠柱状图", "堆积柱", "堆叠柱", "stacked bar"] },
  { type: "groupedBar", patterns: ["分组柱状图", "簇状柱状图", "分组柱", "簇状柱", "grouped bar"] },
  { type: "horizontalBar", patterns: ["条形图", "横向柱状图", "水平柱状图", "horizontal bar"] },
  { type: "radialBar", patterns: ["径向柱图", "径向柱状图", "radial bar"] },
  { type: "composed", patterns: ["组合图", "复合图", "composed"] },
  { type: "stepLine", patterns: ["阶梯图", "阶梯折线", "step line", "step chart"] },
  { type: "funnel", patterns: ["漏斗图", "转化漏斗", "funnel"] },
  { type: "area", patterns: ["面积图", "area chart"] },
  { type: "pie", patterns: ["饼图", "扇形图", "pie"] },
  { type: "line", patterns: ["折线图", "趋势图", "line chart"] },
  { type: "bar", patterns: ["柱状图", "柱形图", "bar chart"] },
];

const CHART_TYPE_ALIASES: Record<string, ChartType> = {
  kline: "candlestick",
  "k-line": "candlestick",
  candle: "candlestick",
  candlestick: "candlestick",
  donut: "doughnut",
  doughnut: "doughnut",
  hbar: "horizontalBar",
  "horizontal-bar": "horizontalBar",
  "stacked-bar": "stackedBar",
  "grouped-bar": "groupedBar",
  "stacked-area": "stackedArea",
  "step-line": "stepLine",
  "radial-bar": "radialBar",
};

export function chartTypeLabel(type: ChartType) {
  return CHART_TYPE_LABELS[type];
}

export function isChartType(value: unknown): value is ChartType {
  return typeof value === "string" && CHART_TYPE_SET.has(value);
}

export function parseChartType(value: unknown): ChartType {
  if (typeof value !== "string") {
    return "bar";
  }

  const trimmed = value.trim();
  if (isChartType(trimmed)) {
    return trimmed;
  }

  const alias = CHART_TYPE_ALIASES[trimmed.toLowerCase()];
  if (alias) {
    return alias;
  }

  return pickChartTypeFromText(trimmed) ?? "bar";
}

function patternToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^[\x00-\x7F]+$/.test(pattern)) {
    return new RegExp(`\\b${escaped.replace(/ /g, "\\s+")}\\b`, "gi");
  }
  return new RegExp(escaped, "gi");
}

/** 多个图形名同时出现时，取匹配结束更靠后、词更长的那个（「转化漏斗 + 柱状图」→ 柱状图） */
export function pickChartTypeFromText(text: string): ChartType | null {
  const matches: { type: ChartType; end: number; length: number }[] = [];

  for (const def of CHART_TYPE_DEFS) {
    for (const pattern of def.patterns) {
      const regex = patternToRegExp(pattern);
      for (const match of text.matchAll(regex)) {
        const start = match.index ?? 0;
        matches.push({
          type: def.type,
          end: start + match[0].length,
          length: match[0].length,
        });
      }
    }
  }

  if (!matches.length) {
    return null;
  }

  matches.sort((left, right) => right.end - left.end || right.length - left.length);
  return matches[0]!.type;
}

export const CHART_INTENT_KEYWORDS = CHART_TYPE_DEFS.flatMap((def) => def.patterns);

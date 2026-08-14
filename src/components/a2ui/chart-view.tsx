"use client";

import { useRef } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  SunburstChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { ChartSpec } from "@/lib/analytics/chart-spec";
import { chartTypeLabel } from "@/lib/analytics/chart-types";
import {
  chartDownloadBasename,
  downloadChartPng,
  downloadChartSvg,
} from "@/lib/export/chart-file";
import { BRAND_CHART_COLORS, BRAND_HEX } from "@/lib/theme";

const PIE_COLORS = [...BRAND_CHART_COLORS];
const AXIS = { stroke: "var(--chart-axis)", fontSize: 11 } as const;
const GRID = "var(--chart-grid)";
const CHART_HEIGHT = 280;

function seriesKeysOf(chart: ChartSpec) {
  return chart.seriesKeys?.length ? chart.seriesKeys : [chart.yKey];
}

function asRows(chart: ChartSpec, numericKeys: string[]) {
  return chart.data.map((row) => {
    const next: Record<string, unknown> = {
      ...row,
      [chart.xKey]: row[chart.xKey],
    };
    for (const key of numericKeys) {
      next[key] = Number(row[key] ?? 0);
    }
    return next;
  });
}

function uniqueValues(rows: Record<string, unknown>[], key: string) {
  return [...new Set(rows.map((row) => String(row[key] ?? "")))];
}

function heatFill(value: number, min: number, max: number) {
  const t = max === min ? 0.65 : (value - min) / (max - min);
  const alpha = 0.18 + t * 0.82;
  return `rgba(255, 102, 0, ${alpha.toFixed(3)})`;
}

function Axes({
  xKey,
  layout,
}: {
  xKey: string;
  layout?: "horizontal" | "vertical";
}) {
  if (layout === "vertical") {
    return (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis type="number" stroke={AXIS.stroke} fontSize={AXIS.fontSize} />
        <YAxis
          type="category"
          dataKey={xKey}
          stroke={AXIS.stroke}
          fontSize={AXIS.fontSize}
          width={88}
        />
        <Tooltip />
      </>
    );
  }

  return (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
      <XAxis dataKey={xKey} stroke={AXIS.stroke} fontSize={AXIS.fontSize} />
      <YAxis stroke={AXIS.stroke} fontSize={AXIS.fontSize} />
      <Tooltip />
    </>
  );
}

function CartesianBars({
  chart,
  stacked,
  layout,
  gap,
}: {
  chart: ChartSpec;
  stacked?: boolean;
  layout?: "horizontal" | "vertical";
  gap?: number;
}) {
  const keys = seriesKeysOf(chart);
  const data = asRows(chart, keys);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} layout={layout} barCategoryGap={gap}>
        <Axes xKey={chart.xKey} layout={layout} />
        {keys.length > 1 ? <Legend /> : null}
        {keys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            stackId={stacked ? "s" : undefined}
            fill={PIE_COLORS[index % PIE_COLORS.length]}
            radius={layout === "vertical" ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function WaterfallPlot({ chart }: { chart: ChartSpec }) {
  const data = chart.data.reduce<
    Array<Record<string, unknown> & { _base: number; _rise: number; _up: boolean; _end: number }>
  >((rows, row) => {
    const value = Number(row[chart.yKey] ?? 0);
    const start = rows.at(-1)?._end ?? 0;
    const end = start + value;
    return [
      ...rows,
      {
        ...row,
        [chart.xKey]: String(row[chart.xKey] ?? ""),
        _base: Math.min(start, end),
        _rise: Math.abs(value),
        _up: value >= 0,
        _end: end,
      },
    ];
  }, []);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data}>
        <Axes xKey={chart.xKey} />
        <Bar dataKey="_base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="_rise" stackId="w" isAnimationActive={false}>
          {data.map((row, index) => (
            <Cell key={index} fill={row._up ? BRAND_HEX.primary : "#f43f5e"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineLikePlot({
  chart,
  variant,
}: {
  chart: ChartSpec;
  variant: "line" | "step" | "area" | "stackedArea";
}) {
  const keys = seriesKeysOf(chart);
  const data = asRows(chart, keys);

  if (variant === "area" || variant === "stackedArea") {
    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data}>
          <Axes xKey={chart.xKey} />
          {keys.length > 1 ? <Legend /> : null}
          {keys.map((key, index) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId={variant === "stackedArea" ? "a" : undefined}
              stroke={PIE_COLORS[index % PIE_COLORS.length]}
              fill={PIE_COLORS[index % PIE_COLORS.length]}
              fillOpacity={0.28}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data}>
        <Axes xKey={chart.xKey} />
        {keys.length > 1 ? <Legend /> : null}
        {keys.map((key, index) => (
          <Line
            key={key}
            type={variant === "step" ? "step" : "monotone"}
            dataKey={key}
            stroke={PIE_COLORS[index % PIE_COLORS.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function PieLikePlot({
  chart,
  innerRadius,
}: {
  chart: ChartSpec;
  innerRadius?: number;
}) {
  const data = asRows(chart, [chart.yKey]).map((row) => ({
    ...row,
    [chart.xKey]: String(row[chart.xKey] ?? ""),
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <PieChart>
        <Pie
          data={data}
          dataKey={chart.yKey}
          nameKey={chart.xKey}
          innerRadius={innerRadius ?? 0}
          outerRadius={84}
          label
          isAnimationActive={false}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function FunnelPlot({ chart }: { chart: ChartSpec }) {
  const data = asRows(chart, [chart.yKey]).map((row) => ({
    ...row,
    [chart.xKey]: String(row[chart.xKey] ?? ""),
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <FunnelChart>
        <Tooltip />
        <Funnel
          data={data}
          dataKey={chart.yKey}
          nameKey={chart.xKey}
          isAnimationActive={false}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
          <LabelList
            position="right"
            fill="var(--chart-label)"
            stroke="none"
            dataKey={chart.xKey}
            fontSize={12}
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

function RadarPlot({ chart }: { chart: ChartSpec }) {
  const keys = seriesKeysOf(chart);
  const data = asRows(chart, keys).map((row) => ({
    ...row,
    [chart.xKey]: String(row[chart.xKey] ?? ""),
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <RadarChart data={data}>
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey={chart.xKey} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
        {keys.map((key, index) => (
          <Radar
            key={key}
            dataKey={key}
            stroke={PIE_COLORS[index % PIE_COLORS.length]}
            fill={PIE_COLORS[index % PIE_COLORS.length]}
            fillOpacity={0.22}
            isAnimationActive={false}
          />
        ))}
        {keys.length > 1 ? <Legend /> : null}
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function ScatterPlot({ chart }: { chart: ChartSpec }) {
  const keys = [chart.xKey, chart.yKey, chart.zKey].filter(
    (key): key is string => Boolean(key),
  );
  const data = asRows(chart, keys);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis
          type="number"
          dataKey={chart.xKey}
          name={chart.xKey}
          stroke={AXIS.stroke}
          fontSize={AXIS.fontSize}
        />
        <YAxis
          type="number"
          dataKey={chart.yKey}
          name={chart.yKey}
          stroke={AXIS.stroke}
          fontSize={AXIS.fontSize}
        />
        {chart.zKey ? (
          <ZAxis dataKey={chart.zKey} range={[40, 220]} name={chart.zKey} />
        ) : null}
        <Tooltip />
        <Scatter data={data} fill={BRAND_HEX.primary} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function RadialPlot({ chart, rose }: { chart: ChartSpec; rose?: boolean }) {
  const data = asRows(chart, [chart.yKey]).map((row, index) => ({
    ...row,
    [chart.xKey]: String(row[chart.xKey] ?? ""),
    fill: PIE_COLORS[index % PIE_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <RadialBarChart
        data={data}
        innerRadius={rose ? "8%" : "28%"}
        outerRadius="90%"
        startAngle={90}
        endAngle={-270}
      >
        <RadialBar dataKey={chart.yKey} background isAnimationActive={false} />
        <Legend />
        <Tooltip />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

function ComposedPlot({ chart }: { chart: ChartSpec }) {
  const keys = seriesKeysOf(chart);
  const data = asRows(chart, keys);
  const barKey = keys[0]!;
  const lineKey = keys[1] ?? keys[0]!;

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <ComposedChart data={data}>
        <Axes xKey={chart.xKey} />
        <Legend />
        <Bar
          dataKey={barKey}
          fill={BRAND_HEX.primary}
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey={lineKey}
          stroke={BRAND_HEX.soft}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function TreemapPlot({ chart }: { chart: ChartSpec }) {
  const data = chart.data.map((row, index) => ({
    name: String(row[chart.xKey] ?? ""),
    size: Number(row[chart.yKey] ?? 0),
    fill: PIE_COLORS[index % PIE_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <Treemap
        data={data}
        dataKey="size"
        nameKey="name"
        aspectRatio={4 / 3}
        isAnimationActive={false}
      >
        <Tooltip />
      </Treemap>
    </ResponsiveContainer>
  );
}

function SunburstPlot({ chart }: { chart: ChartSpec }) {
  const children = chart.data.map((row, index) => ({
    name: String(row[chart.xKey] ?? ""),
    value: Number(row[chart.yKey] ?? 0),
    fill: PIE_COLORS[index % PIE_COLORS.length],
  }));

  return (
    <div className="h-70 w-full">
      <SunburstChart
        data={{ name: chart.title || "合计", children }}
        dataKey="value"
        responsive
      />
    </div>
  );
}

function SankeyPlot({ chart }: { chart: ChartSpec }) {
  const sourceKey = chart.sourceKey ?? chart.xKey;
  const targetKey = chart.targetKey;
  const valueKey = chart.yKey;
  if (!targetKey) {
    return <CartesianBars chart={chart} />;
  }

  const names: string[] = [];
  const indexOf = (name: string) => {
    const existing = names.indexOf(name);
    if (existing >= 0) {
      return existing;
    }
    names.push(name);
    return names.length - 1;
  };

  const links = chart.data.map((row) => ({
    source: indexOf(String(row[sourceKey] ?? "")),
    target: indexOf(String(row[targetKey] ?? "")),
    value: Number(row[valueKey] ?? 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <Sankey
        data={{
          nodes: names.map((name) => ({ name })),
          links,
        }}
        nodePadding={28}
        margin={{ left: 12, right: 12, top: 8, bottom: 8 }}
      >
        <Tooltip />
      </Sankey>
    </ResponsiveContainer>
  );
}

function GaugePlot({ chart }: { chart: ChartSpec }) {
  const value = Number(chart.data[0]?.[chart.yKey] ?? 0);
  const max = value > 100 ? Math.ceil(value / 10) * 10 : 100;
  const data = [
    { name: "value", v: Math.min(value, max) },
    { name: "rest", v: Math.max(max - value, 0) },
  ];

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <PieChart>
        <Pie
          data={data}
          dataKey="v"
          startAngle={180}
          endAngle={0}
          innerRadius={72}
          outerRadius={96}
          cx="50%"
          cy="68%"
          isAnimationActive={false}
        >
          <Cell fill={BRAND_HEX.primary} />
          <Cell fill="var(--chart-gauge-track)" />
        </Pie>
        <text
          x="50%"
          y="72%"
          textAnchor="middle"
          fill="var(--foreground)"
          fontSize="22"
          fontWeight={600}
        >
          {Number.isFinite(value) ? value.toLocaleString() : "—"}
        </text>
        <text x="50%" y="84%" textAnchor="middle" fill="var(--chart-axis)" fontSize="11">
          {String(chart.data[0]?.[chart.xKey] ?? chart.title ?? "")}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

function HeatmapPlot({ chart }: { chart: ChartSpec }) {
  const rows = chart.data;
  const xLabels = uniqueValues(rows, chart.xKey);
  const yLabels = chart.seriesKeys?.length
    ? chart.seriesKeys
    : uniqueValues(rows, chart.yKey);
  const valueOf = (x: string, y: string) => {
    if (chart.seriesKeys?.length) {
      const row = rows.find((item) => String(item[chart.xKey] ?? "") === x);
      return Number(row?.[y] ?? 0);
    }
    const row = rows.find(
      (item) =>
        String(item[chart.xKey] ?? "") === x &&
        String(item[chart.yKey] ?? "") === y,
    );
    return Number(row?.[chart.zKey ?? chart.yKey] ?? 0);
  };
  const values = xLabels.flatMap((x) => yLabels.map((y) => valueOf(x, y)));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const cellW = Math.max(36, Math.min(72, 520 / Math.max(xLabels.length, 1)));
  const cellH = 28;

  return (
    <div className="overflow-x-auto">
      <svg
        width={88 + cellW * xLabels.length}
        height={44 + cellH * yLabels.length}
        role="img"
      >
        {yLabels.map((y, rowIndex) => (
          <g key={y}>
            <text
              x={84}
              y={16 + rowIndex * cellH + cellH / 2}
              textAnchor="end"
              fill="var(--chart-tick)"
              fontSize="11"
              dominantBaseline="middle"
            >
              {y}
            </text>
            {xLabels.map((x, colIndex) => {
              const value = valueOf(x, y);
              return (
                <g key={`${x}-${y}`}>
                  <rect
                    x={92 + colIndex * cellW}
                    y={4 + rowIndex * cellH}
                    width={cellW - 4}
                    height={cellH - 4}
                    rx={3}
                    fill={heatFill(value, min, max)}
                  />
                  <text
                    x={92 + colIndex * cellW + (cellW - 4) / 2}
                    y={4 + rowIndex * cellH + (cellH - 4) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--foreground)"
                    fontSize="10"
                  >
                    {value}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
        {yLabels.length > 0
          ? xLabels.map((x, colIndex) => (
              <text
                key={x}
                x={92 + colIndex * cellW + (cellW - 4) / 2}
                y={24 + cellH * yLabels.length}
                textAnchor="middle"
                fill="var(--chart-axis)"
                fontSize="10"
              >
                {x}
              </text>
            ))
          : null}
      </svg>
    </div>
  );
}

function CandlestickPlot({ chart }: { chart: ChartSpec }) {
  const { openKey, highKey, lowKey, closeKey } = chart;
  if (!openKey || !highKey || !lowKey || !closeKey) {
    return <LineLikePlot chart={chart} variant="line" />;
  }

  const highs = chart.data.map((row) => Number(row[highKey]));
  const lows = chart.data.map((row) => Number(row[lowKey]));
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;
  const plotH = 200;
  const plotTop = 16;
  const toY = (value: number) => plotTop + ((max - value) / range) * plotH;
  const step = 16;
  const width = Math.max(chart.data.length * step + 24, 320);

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={240} role="img">
        {chart.data.map((row, index) => {
          const x = 20 + index * step;
          const open = Number(row[openKey]);
          const close = Number(row[closeKey]);
          const high = Number(row[highKey]);
          const low = Number(row[lowKey]);
          const up = close >= open;
          const color = up ? "#22c55e" : "#f43f5e";
          const bodyTop = toY(Math.max(open, close));
          const bodyH = Math.max(Math.abs(toY(close) - toY(open)), 1);
          return (
            <g key={index}>
              <line
                x1={x}
                x2={x}
                y1={toY(high)}
                y2={toY(low)}
                stroke={color}
                strokeWidth={1.5}
              />
              <rect
                x={x - 4}
                y={bodyTop}
                width={8}
                height={bodyH}
                fill={color}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ChartPlot({ chart }: { chart: ChartSpec }) {
  switch (chart.type) {
    case "groupedBar":
      return <CartesianBars chart={chart} />;
    case "stackedBar":
      return <CartesianBars chart={chart} stacked />;
    case "horizontalBar":
      return <CartesianBars chart={chart} layout="vertical" />;
    case "histogram":
      return <CartesianBars chart={chart} gap={0} />;
    case "waterfall":
      return <WaterfallPlot chart={chart} />;
    case "line":
      return <LineLikePlot chart={chart} variant="line" />;
    case "stepLine":
      return <LineLikePlot chart={chart} variant="step" />;
    case "area":
      return <LineLikePlot chart={chart} variant="area" />;
    case "stackedArea":
      return <LineLikePlot chart={chart} variant="stackedArea" />;
    case "pie":
      return <PieLikePlot chart={chart} />;
    case "doughnut":
      return <PieLikePlot chart={chart} innerRadius={52} />;
    case "rose":
      return <RadialPlot chart={chart} rose />;
    case "funnel":
      return <FunnelPlot chart={chart} />;
    case "radar":
      return <RadarPlot chart={chart} />;
    case "scatter":
      return <ScatterPlot chart={chart} />;
    case "bubble":
      return <ScatterPlot chart={chart} />;
    case "treemap":
      return <TreemapPlot chart={chart} />;
    case "sunburst":
      return <SunburstPlot chart={chart} />;
    case "sankey":
      return <SankeyPlot chart={chart} />;
    case "radialBar":
      return <RadialPlot chart={chart} />;
    case "composed":
      return <ComposedPlot chart={chart} />;
    case "candlestick":
      return <CandlestickPlot chart={chart} />;
    case "gauge":
      return <GaugePlot chart={chart} />;
    case "heatmap":
      return <HeatmapPlot chart={chart} />;
    case "bar":
    default:
      return <CartesianBars chart={chart} />;
  }
}

export function ChartCard({ chart }: { chart: ChartSpec }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const typeLabel = chartTypeLabel(chart.type);
  const title = chart.title || typeLabel;

  const takeSvg = () => frameRef.current?.querySelector("svg") ?? null;

  const onDownloadSvg = () => {
    const svg = takeSvg();
    if (!svg) {
      return;
    }
    downloadChartSvg(
      svg,
      `${chartDownloadBasename(title, typeLabel)}-${Date.now()}.svg`,
    );
  };

  const onDownloadPng = () => {
    const svg = takeSvg();
    if (!svg) {
      return;
    }
    void downloadChartPng(
      svg,
      `${chartDownloadBasename(title, typeLabel)}-${Date.now()}.png`,
    );
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-muted">
          {title}
          <span className="ml-2 font-normal text-muted-foreground">{typeLabel}</span>
        </p>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onDownloadPng}
            className="ui-btn-secondary px-2.5 py-1 text-[11px]"
          >
            下载 PNG
          </button>
          <button
            type="button"
            onClick={onDownloadSvg}
            className="ui-btn-secondary px-2.5 py-1 text-[11px]"
          >
            下载 SVG
          </button>
        </div>
      </div>
      <div ref={frameRef}>
        <ChartPlot chart={chart} />
      </div>
    </div>
  );
}

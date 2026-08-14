import { z } from "zod";

import {
  CHART_TYPES,
  type ChartType,
  parseChartType,
} from "@/lib/analytics/chart-types";

export type { ChartType };
export { parseChartType, CHART_TYPES };

export const chartSpecSchema = z.object({
  type: z.enum(CHART_TYPES),
  title: z.string().optional(),
  xKey: z.string(),
  yKey: z.string(),
  zKey: z.string().optional(),
  seriesKeys: z.array(z.string()).optional(),
  openKey: z.string().optional(),
  highKey: z.string().optional(),
  lowKey: z.string().optional(),
  closeKey: z.string().optional(),
  sourceKey: z.string().optional(),
  targetKey: z.string().optional(),
  data: z.array(z.record(z.string(), z.unknown())),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;

const MULTI_SERIES_TYPES = new Set<ChartType>([
  "groupedBar",
  "stackedBar",
  "stackedArea",
  "radar",
  "composed",
]);

function isNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return true;
  }

  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return true;
  }

  return false;
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function findColumn(columns: string[], aliases: string[]) {
  return columns.find((column) =>
    aliases.some((alias) => column.toLowerCase().includes(alias.toLowerCase())),
  );
}

function withNumericFields(
  rows: Record<string, unknown>[],
  keys: string[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const next = { ...row };
    for (const key of keys) {
      next[key] = toNumber(row[key]);
    }
    return next;
  });
}

function looksLikeTimeColumn(column: string) {
  return /date|time|day|month|week|dt|_at$/i.test(column);
}

function defaultChartType(xKey: string, rowCount: number): ChartType {
  return rowCount >= 5 && looksLikeTimeColumn(xKey) ? "line" : "bar";
}

function buildGaugeSpec(
  numericCols: string[],
  categoryCols: string[],
  rows: Record<string, unknown>[],
  title?: string,
): ChartSpec | null {
  const yKey = numericCols[0];
  if (!yKey) {
    return null;
  }

  const label = categoryCols[0]
    ? String(rows[0]?.[categoryCols[0]] ?? yKey)
    : yKey;

  return {
    type: "gauge",
    title,
    xKey: "name",
    yKey: "value",
    data: [{ name: label, value: toNumber(rows[0]?.[yKey]) }],
  };
}

function buildScatterSpec(
  type: "scatter" | "bubble",
  numericCols: string[],
  rows: Record<string, unknown>[],
  title?: string,
): ChartSpec | null {
  if (numericCols.length < 2) {
    return null;
  }

  const xKey = numericCols[0]!;
  const yKey = numericCols[1]!;
  const zKey = type === "bubble" ? numericCols[2] : undefined;
  const keys = zKey ? [xKey, yKey, zKey] : [xKey, yKey];

  return {
    type,
    title,
    xKey,
    yKey,
    zKey,
    data: withNumericFields(rows, keys),
  };
}

function buildCandlestickSpec(
  columns: string[],
  numericCols: string[],
  categoryCols: string[],
  rows: Record<string, unknown>[],
  title?: string,
): ChartSpec | null {
  const openKey = findColumn(columns, ["open", "开盘"]) ?? numericCols[0];
  const highKey = findColumn(columns, ["high", "最高"]) ?? numericCols[1];
  const lowKey = findColumn(columns, ["low", "最低"]) ?? numericCols[2];
  const closeKey = findColumn(columns, ["close", "收盘"]) ?? numericCols[3];
  if (!openKey || !highKey || !lowKey || !closeKey) {
    return null;
  }

  const xKey = categoryCols[0] ?? findColumn(columns, ["date", "time", "day", "dt"]) ?? "index";
  const data = rows.map((row, index) => ({
    ...row,
    [xKey]: row[xKey] ?? index + 1,
    [openKey]: toNumber(row[openKey]),
    [highKey]: toNumber(row[highKey]),
    [lowKey]: toNumber(row[lowKey]),
    [closeKey]: toNumber(row[closeKey]),
  }));

  return {
    type: "candlestick",
    title,
    xKey,
    yKey: closeKey,
    openKey,
    highKey,
    lowKey,
    closeKey,
    data,
  };
}

function buildSankeySpec(
  columns: string[],
  numericCols: string[],
  categoryCols: string[],
  rows: Record<string, unknown>[],
  title?: string,
): ChartSpec | null {
  const sourceKey =
    findColumn(columns, ["source", "from", "来源", "起点"]) ?? categoryCols[0];
  const targetKey =
    findColumn(columns, ["target", "to", "去向", "终点", "目标"]) ??
    categoryCols.find((column) => column !== sourceKey);
  const yKey = numericCols[0];
  if (!sourceKey || !targetKey || !yKey || sourceKey === targetKey) {
    return null;
  }

  return {
    type: "sankey",
    title,
    xKey: sourceKey,
    yKey,
    sourceKey,
    targetKey,
    data: withNumericFields(rows, [yKey]),
  };
}

function buildHeatmapSpec(
  numericCols: string[],
  categoryCols: string[],
  rows: Record<string, unknown>[],
  title?: string,
): ChartSpec | null {
  if (categoryCols.length >= 2 && numericCols[0]) {
    return {
      type: "heatmap",
      title,
      xKey: categoryCols[0]!,
      yKey: categoryCols[1]!,
      zKey: numericCols[0],
      data: withNumericFields(rows, [numericCols[0]]),
    };
  }

  if (categoryCols.length >= 1 && numericCols.length >= 2) {
    return {
      type: "heatmap",
      title,
      xKey: categoryCols[0]!,
      yKey: numericCols[0]!,
      seriesKeys: numericCols,
      data: withNumericFields(rows, numericCols),
    };
  }

  return null;
}

function buildRadarFromMetrics(
  numericCols: string[],
  rows: Record<string, unknown>[],
  title?: string,
): ChartSpec | null {
  if (numericCols.length < 3 || rows.length !== 1) {
    return null;
  }

  return {
    type: "radar",
    title,
    xKey: "name",
    yKey: "value",
    data: numericCols.map((column) => ({
      name: column,
      value: toNumber(rows[0]?.[column]),
    })),
  };
}

/** 根据查询结果推断图表；不适合时返回 null */
export function buildChartSpecFromRows(
  columns: string[],
  rows: Record<string, unknown>[],
  options?: { title?: string; preferredType?: ChartType | string },
): ChartSpec | null {
  if (!columns.length || rows.length === 0 || rows.length > 100) {
    return null;
  }

  const numericCols = columns.filter((col) =>
    rows.every((row) => row[col] === null || isNumeric(row[col])),
  );
  const categoryCols = columns.filter((col) => !numericCols.includes(col));
  const preferred = options?.preferredType
    ? parseChartType(options.preferredType)
    : undefined;
  const title = options?.title;

  if (preferred === "gauge") {
    const gauge = buildGaugeSpec(numericCols, categoryCols, rows, title);
    if (gauge) {
      return gauge;
    }
  }

  if (preferred === "scatter" || preferred === "bubble") {
    const scatter = buildScatterSpec(preferred, numericCols, rows, title);
    if (scatter) {
      return scatter;
    }
  }

  if (preferred === "candlestick") {
    const candle = buildCandlestickSpec(
      columns,
      numericCols,
      categoryCols,
      rows,
      title,
    );
    if (candle) {
      return candle;
    }
  }

  if (preferred === "sankey") {
    const sankey = buildSankeySpec(
      columns,
      numericCols,
      categoryCols,
      rows,
      title,
    );
    if (sankey) {
      return sankey;
    }
  }

  if (preferred === "heatmap") {
    const heatmap = buildHeatmapSpec(numericCols, categoryCols, rows, title);
    if (heatmap) {
      return heatmap;
    }
  }

  if (preferred === "radar") {
    const radar = buildRadarFromMetrics(numericCols, rows, title);
    if (radar) {
      return radar;
    }
  }

  if (!numericCols.length || !categoryCols.length) {
    return null;
  }

  if (rows.length === 1) {
    return null;
  }

  const xKey = categoryCols[0]!;
  const yKey = numericCols[0]!;
  let type: ChartType = preferred ?? defaultChartType(xKey, rows.length);

  if (type === "pie" && rows.length > 12) {
    type = "bar";
  }

  const seriesKeys = MULTI_SERIES_TYPES.has(type) ? numericCols : undefined;

  return {
    type,
    title,
    xKey,
    yKey,
    seriesKeys,
    data: withNumericFields(rows, numericCols),
  };
}

export type ChartType = "bar" | "line" | "pie";

export type ChartSpec = {
  type: ChartType;
  title?: string;
  xKey: string;
  yKey: string;
  data: Record<string, unknown>[];
};

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

/** 根据查询结果推断简单图表；不适合时返回 null */
export function buildChartSpecFromRows(
  columns: string[],
  rows: Record<string, unknown>[],
  options?: { title?: string; preferredType?: ChartType },
): ChartSpec | null {
  if (!columns.length || rows.length === 0 || rows.length > 100) {
    return null;
  }

  const numericCols = columns.filter((col) =>
    rows.every((row) => row[col] === null || isNumeric(row[col])),
  );
  const categoryCols = columns.filter((col) => !numericCols.includes(col));

  if (!numericCols.length || !categoryCols.length) {
    // Single-row metric: skip chart
    if (rows.length === 1 && numericCols.length >= 1) {
      return null;
    }

    return null;
  }

  const xKey = categoryCols[0]!;
  const yKey = numericCols[0]!;
  const type: ChartType =
    options?.preferredType ??
    (rows.length >= 5 && /date|time|day|month|week/i.test(xKey) ? "line" : "bar");

  return {
    type: type === "pie" && rows.length > 12 ? "bar" : type,
    title: options?.title,
    xKey,
    yKey,
    data: rows.map((row) => ({
      ...row,
      [yKey]: toNumber(row[yKey]),
    })),
  };
}

export function parseChartType(value: unknown): ChartType {
  if (value === "line" || value === "pie" || value === "bar") {
    return value;
  }

  return "bar";
}

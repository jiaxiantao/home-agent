import { formatDisplayValue } from "@/lib/analytics/display-value";

export function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const text =
    typeof value === "object"
      ? formatDisplayValue(value, 10_000)
      : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function buildCsv(columns: string[], rows: Record<string, unknown>[]) {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(row[column])).join(","),
  );

  return [header, ...body].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

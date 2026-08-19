const DISPLAY_STRING_KEYS = [
  "displayValue",
  "display",
  "title",
  "label",
  "text",
  "name",
] as const;

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatObjectDisplay(record: Record<string, unknown>, maxLength: number) {
  for (const key of DISPLAY_STRING_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return truncate(value.trim(), maxLength);
    }
  }

  const brand = record.brandName ?? record.brand;
  const model = record.modelName ?? record.model;
  const parts = [brand, model].filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  if (parts.length) {
    return truncate(parts.join(" "), maxLength);
  }

  return truncate(JSON.stringify(record), maxLength);
}

/** 将 SQL/API 单元格值格式化为用户可读文本（含 JSON 列、车型对象等） */
export function formatDisplayValue(value: unknown, maxLength = 240): string {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return truncate(value.toISOString(), maxLength);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return formatDisplayValue(JSON.parse(trimmed), maxLength);
      } catch {
        return truncate(trimmed, maxLength);
      }
    }
    return truncate(trimmed, maxLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatDisplayValue(item, 80))
      .filter((item) => item.length > 0);
    return truncate(parts.join("、"), maxLength);
  }

  if (typeof value === "object") {
    return formatObjectDisplay(value as Record<string, unknown>, maxLength);
  }

  return truncate(String(value), maxLength);
}

export function formatRecordAsBulletList(
  columns: string[],
  row: Record<string, unknown>,
) {
  return columns
    .map((column) => {
      const display = formatDisplayValue(row[column]);
      if (!display) {
        return null;
      }
      return `- **${column}**：${display}`;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

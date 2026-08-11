const SENSITIVE_COLUMN =
  /(?:^|_)(phone|mobile|tel|id_?card|identity|password|pwd|secret|email|bank_?card|credit_?card)(?:_|$)/i;

export function isSensitiveColumn(column: string) {
  return SENSITIVE_COLUMN.test(column);
}

function maskScalar(value: unknown) {
  if (value === null || value === undefined) {
    return value;
  }

  const text = String(value);

  if (text.length <= 4) {
    return "****";
  }

  return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

export function maskQueryRows(
  columns: string[],
  rows: Record<string, unknown>[],
) {
  const sensitive = new Set(columns.filter(isSensitiveColumn));

  if (!sensitive.size) {
    return rows;
  }

  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row };

    for (const column of sensitive) {
      if (column in next) {
        next[column] = maskScalar(next[column]);
      }
    }

    return next;
  });
}

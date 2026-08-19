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

/**
 * 行级遮蔽只覆盖结构化结果；模型合成的自由文本会把身份证、银行卡这类值原样复述出来。
 * 出口再过一遍强格式凭证。手机号不在此列——用户常以手机号作为查询条件，
 * 遮蔽后回答会自相矛盾，该场景由行级 maskQueryRows 与表格渲染负责。
 */
const FREE_TEXT_PII_RULES: Array<{ pattern: RegExp; keep: number }> = [
  // 身份证：18 位，末位可为 X
  { pattern: /\b\d{17}[\dXx]\b/g, keep: 4 },
  // 银行卡：16–19 位连续数字
  { pattern: /\b\d{16,19}\b/g, keep: 4 },
];

function maskDigits(value: string, keep: number) {
  if (value.length <= keep) {
    return "*".repeat(value.length);
  }
  return `${"*".repeat(value.length - keep)}${value.slice(-keep)}`;
}

export function maskFreeTextPii(text: string) {
  let masked = text;
  for (const { pattern, keep } of FREE_TEXT_PII_RULES) {
    masked = masked.replace(pattern, (match) => maskDigits(match, keep));
  }
  return masked;
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

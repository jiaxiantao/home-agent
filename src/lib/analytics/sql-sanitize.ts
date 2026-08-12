/** HTTP/API 查询参数名，不是 MySQL 列名 */
const API_ONLY_WHERE_COLUMNS = ["objCode"] as const;

function mapRecordIdToCustomerId(sql: string): { sql: string; changed: boolean } {
  if (!/customer/i.test(sql) || !/\brecordId\s*=/i.test(sql)) {
    return { sql, changed: false };
  }
  const mapped = sql.replace(/\b[`"']?recordId[`"']?\s*=/gi, "id =");
  return { sql: mapped, changed: mapped !== sql };
}

function normalizeWhitespace(sql: string) {
  return sql.replace(/\s{2,}/g, " ").trim();
}

function cleanupWhereClause(sql: string) {
  return normalizeWhitespace(
    sql
      .replace(/\bWHERE\s+AND\b/gi, "WHERE")
      .replace(/\bWHERE\s+OR\b/gi, "WHERE")
      .replace(/\bAND\s+AND\b/gi, "AND")
      .replace(/\bOR\s+OR\b/gi, "OR"),
  );
}

/** 移除 LLM 误写入 SQL 的 API 参数条件（如 objCode=customer） */
export function sanitizeAgentSql(sql: string): {
  sql: string;
  changed: boolean;
  notes: string[];
} {
  let result = sql.trim();
  const notes: string[] = [];

  const recordMapped = mapRecordIdToCustomerId(result);
  if (recordMapped.changed) {
    result = recordMapped.sql;
    notes.push("CRM 客户表已将 recordId 条件映射为 id 列");
  }

  for (const column of API_ONLY_WHERE_COLUMNS) {
    const quoted = `[\\"'\\\`]?${column}[\\"'\\\`]?`;
    const value = String.raw`(?:'[^']*'|"[^"]*"|\?)`;

    const trailingAnd = new RegExp(
      String.raw`\s+AND\s+${quoted}\s*=\s*${value}`,
      "gi",
    );
    if (trailingAnd.test(result)) {
      result = result.replace(trailingAnd, "");
      notes.push(`已移除 API 参数 ${column}（非数据库列）`);
    }

    const leadingAnd = new RegExp(
      String.raw`\b${quoted}\s*=\s*${value}\s+AND\s+`,
      "gi",
    );
    if (leadingAnd.test(result)) {
      result = result.replace(leadingAnd, "");
      notes.push(`已移除 API 参数 ${column}（非数据库列）`);
    }

    const whereOnly = new RegExp(
      String.raw`\bWHERE\s+${quoted}\s*=\s*${value}(?=\s*(?:LIMIT|ORDER|GROUP|$))`,
      "gi",
    );
    if (whereOnly.test(result)) {
      result = result.replace(whereOnly, "WHERE 1=1");
      notes.push(`已移除 API 参数 ${column}（非数据库列）`);
    }
  }

  result = cleanupWhereClause(result);

  return {
    sql: result,
    changed: result !== sql.trim(),
    notes: [...new Set(notes)],
  };
}

export function fixSqlFromExecutionError(
  sql: string,
  errorMessage: string,
): { sql: string; changed: boolean; notes: string[] } | null {
  if (
    !/Unknown column 'objCode'|Unknown column 'recordId'/i.test(errorMessage)
  ) {
    return null;
  }
  const sanitized = sanitizeAgentSql(sql);
  return sanitized.changed ? sanitized : null;
}

const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|GRANT|REVOKE|CALL|EXEC|EXECUTE|MERGE|LOAD|OUTFILE|DUMPFILE|INTO\s+OUTFILE|INTO\s+DUMPFILE|SET\s+|USE\s+|LOCK\s+|UNLOCK\s+|HANDLER|PREPARE|DEALLOCATE|SLEEP\s*\()/i;

const ALLOWED_PREFIX =
  /^(WITH\b[\s\S]+SELECT\b|SELECT\b|SHOW\b|DESCRIBE\b|DESC\b|EXPLAIN\b)/i;

export type SqlGuardResult =
  | { ok: true; sql: string }
  | { ok: false; reason: string };

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/#[^\n]*/g, " ")
    .trim();
}

export function assertReadOnlySql(rawSql: string): SqlGuardResult {
  const stripped = stripSqlComments(rawSql);

  if (!stripped) {
    return { ok: false, reason: "SQL 为空" };
  }

  if (stripped.length > 8000) {
    return { ok: false, reason: "SQL 过长" };
  }

  // Reject multiple statements (allow trailing semicolon only).
  const withoutTrailingSemi = stripped.replace(/;+\s*$/, "");
  if (withoutTrailingSemi.includes(";")) {
    return { ok: false, reason: "禁止多语句执行" };
  }

  if (!ALLOWED_PREFIX.test(withoutTrailingSemi)) {
    return {
      ok: false,
      reason: "仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN 只读语句",
    };
  }

  if (FORBIDDEN_KEYWORDS.test(withoutTrailingSemi)) {
    return { ok: false, reason: "检测到危险关键字，已拒绝执行" };
  }

  return { ok: true, sql: withoutTrailingSemi };
}

export function ensureLimit(sql: string, maxRows: number): string {
  const normalized = sql.trim();
  const upper = normalized.toUpperCase();

  if (
    upper.startsWith("SHOW") ||
    upper.startsWith("DESCRIBE") ||
    upper.startsWith("DESC") ||
    upper.startsWith("EXPLAIN")
  ) {
    return normalized;
  }

  if (/\bLIMIT\s+\d+(\s*,\s*\d+)?\s*$/i.test(normalized)) {
    return normalized.replace(/\bLIMIT\s+(\d+)(\s*,\s*\d+)?\s*$/i, (_match, first) => {
      const limit = Math.min(Number(first), maxRows);
      return `LIMIT ${limit}`;
    });
  }

  return `${normalized}\nLIMIT ${maxRows}`;
}

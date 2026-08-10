const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bTRUNCATE\b/i,
  /\bREPLACE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCALL\b/i,
  /\bEXECUTE\b/i,
  /\bEXEC\b/i,
  /\bMERGE\b/i,
  /\bLOAD\b/i,
  /\bOUTFILE\b/i,
  /\bDUMPFILE\b/i,
  /\bINTO\s+OUTFILE\b/i,
  /\bINTO\s+DUMPFILE\b/i,
  /\bSET\s+/i,
  /\bUSE\s+/i,
  /\bLOCK\b/i,
  /\bUNLOCK\b/i,
  /\bHANDLER\b/i,
  /\bPREPARE\b/i,
  /\bDEALLOCATE\b/i,
  /\bSLEEP\s*\(/i,
] as const;

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

function hasForbiddenKeyword(sql: string) {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(sql));
}

export function assertReadOnlySql(rawSql: string): SqlGuardResult {
  const stripped = stripSqlComments(rawSql);

  if (!stripped) {
    return { ok: false, reason: "SQL 为空" };
  }

  if (stripped.length > 8000) {
    return { ok: false, reason: "SQL 过长" };
  }

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

  if (hasForbiddenKeyword(withoutTrailingSemi)) {
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

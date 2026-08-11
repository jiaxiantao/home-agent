const TABLE_PATTERN =
  /\b(?:FROM|JOIN)\s+(?:`?([a-zA-Z0-9_]+)`?\.)?`?([a-zA-Z0-9_]+)`?/gi;

const DESCRIBE_PATTERN =
  /^(?:DESCRIBE|DESC)\s+(?:`?([a-zA-Z0-9_]+)`?\.)?`?([a-zA-Z0-9_]+)`?/i;

const SHOW_TABLES_PATTERN = /^SHOW\s+(?:FULL\s+)?TABLES/i;
const SHOW_CREATE_PATTERN = /^SHOW\s+CREATE\s+TABLE/i;

function stripSqlLiterals(sql: string) {
  return sql
    .replace(/'(?:\\'|[^'])*'/g, " '' ")
    .replace(/"(?:\\"|[^"])*"/g, ' "" ')
    .replace(/`(?:\\`|[^`])*`/g, (match) => match.replace(/[^`]/g, "x"));
}

export function getTableAllowlist(): Set<string> | null {
  const raw = process.env.ANALYTICS_MYSQL_TABLE_ALLOWLIST?.trim();

  if (!raw) {
    return null;
  }

  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function extractReferencedTables(sql: string): string[] {
  const normalized = stripSqlLiterals(sql.trim());
  const upper = normalized.toUpperCase();

  if (SHOW_TABLES_PATTERN.test(upper)) {
    return [];
  }

  const describeMatch = DESCRIBE_PATTERN.exec(normalized);

  if (describeMatch) {
    const table = describeMatch[2] ?? describeMatch[1];
    return table ? [table.toLowerCase()] : [];
  }

  if (SHOW_CREATE_PATTERN.test(upper)) {
    const match = normalized.match(
      /SHOW\s+CREATE\s+TABLE\s+(?:`?([a-zA-Z0-9_]+)`?\.)?`?([a-zA-Z0-9_]+)`?/i,
    );
    const table = match?.[2] ?? match?.[1];
    return table ? [table.toLowerCase()] : [];
  }

  if (upper.includes("INFORMATION_SCHEMA")) {
    return [];
  }

  const tables = new Set<string>();
  TABLE_PATTERN.lastIndex = 0;

  for (const match of normalized.matchAll(TABLE_PATTERN)) {
    const table = (match[2] ?? match[1])?.toLowerCase();

    if (table && !["select", "where", "group", "order", "limit"].includes(table)) {
      tables.add(table);
    }
  }

  return [...tables];
}

export type TableAllowlistResult =
  | { ok: true; tables: string[] }
  | { ok: false; reason: string; tables: string[] };

export function assertAllowedTables(sql: string): TableAllowlistResult {
  const allowlist = getTableAllowlist();
  const tables = extractReferencedTables(sql);

  if (!allowlist) {
    return { ok: true, tables };
  }

  if (!tables.length) {
    return { ok: true, tables };
  }

  const denied = tables.filter((table) => !allowlist.has(table));

  if (denied.length) {
    return {
      ok: false,
      reason: `查询引用了未授权表：${denied.join(", ")}。允许列表：${[...allowlist].join(", ")}`,
      tables,
    };
  }

  return { ok: true, tables };
}

export function filterAllowedTableNames(names: string[]) {
  const allowlist = getTableAllowlist();

  if (!allowlist) {
    return names;
  }

  return names.filter((name) => allowlist.has(name.toLowerCase()));
}

export function assertTableNameAllowed(tableName: string) {
  const allowlist = getTableAllowlist();

  if (!allowlist) {
    return;
  }

  const normalized = tableName.trim().toLowerCase();

  if (!allowlist.has(normalized)) {
    throw new Error(
      `表 ${tableName} 不在授权列表中。允许：${[...allowlist].join(", ")}`,
    );
  }
}

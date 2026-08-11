import { getRegistryDatabaseNames } from "@/lib/analytics/project-databases";

const DB_FROM_TABLE_PATTERN =
  /\b(?:FROM|JOIN)\s+`?([a-zA-Z0-9_-]+)`?\s*\.\s*`?[a-zA-Z0-9_]+`?/gi;

const DESCRIBE_DB_PATTERN =
  /^(?:DESCRIBE|DESC)\s+`?([a-zA-Z0-9_-]+)`?\s*\.\s*`?[a-zA-Z0-9_]+`?/i;

const SHOW_CREATE_DB_PATTERN =
  /^SHOW\s+CREATE\s+TABLE\s+`?([a-zA-Z0-9_-]+)`?\s*\.\s*`?[a-zA-Z0-9_]+`?/i;

function stripSqlLiterals(sql: string) {
  return sql
    .replace(/'(?:\\'|[^'])*'/g, " '' ")
    .replace(/"(?:\\"|[^"])*"/g, ' "" ');
}

/** 未配置时默认使用项目登记库列表，避免扫到实例上无关库 */
export function getDatabaseAllowlist(): Set<string> | null {
  const raw = process.env.ANALYTICS_MYSQL_DATABASE_ALLOWLIST?.trim();

  if (raw === "*") {
    return null;
  }

  if (raw) {
    return new Set(
      raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  return new Set(getRegistryDatabaseNames().map((name) => name.toLowerCase()));
}

export function extractReferencedDatabases(sql: string): string[] {
  const normalized = stripSqlLiterals(sql.trim());
  const databases = new Set<string>();

  const describeMatch = DESCRIBE_DB_PATTERN.exec(normalized);
  if (describeMatch?.[1]) {
    databases.add(describeMatch[1].toLowerCase());
  }

  const showCreateMatch = SHOW_CREATE_DB_PATTERN.exec(normalized);
  if (showCreateMatch?.[1]) {
    databases.add(showCreateMatch[1].toLowerCase());
  }

  DB_FROM_TABLE_PATTERN.lastIndex = 0;
  for (const match of normalized.matchAll(DB_FROM_TABLE_PATTERN)) {
    const database = match[1]?.toLowerCase();
    if (database) {
      databases.add(database);
    }
  }

  return [...databases];
}

export type DatabaseAllowlistResult =
  | { ok: true; databases: string[] }
  | { ok: false; reason: string; databases: string[] };

export function assertAllowedDatabases(sql: string): DatabaseAllowlistResult {
  const allowlist = getDatabaseAllowlist();
  const databases = extractReferencedDatabases(sql);

  if (!allowlist) {
    return { ok: true, databases };
  }

  if (!databases.length) {
    return { ok: true, databases };
  }

  const denied = databases.filter((database) => !allowlist.has(database));

  if (denied.length) {
    return {
      ok: false,
      reason: `查询引用了未授权数据库：${denied.join(", ")}。允许列表见 ANALYTICS_MYSQL_DATABASE_ALLOWLIST（或项目登记库）`,
      databases,
    };
  }

  return { ok: true, databases };
}

export function assertDatabaseNameAllowed(database: string) {
  const allowlist = getDatabaseAllowlist();

  if (!allowlist) {
    return;
  }

  const normalized = database.trim().toLowerCase();

  if (!allowlist.has(normalized)) {
    throw new Error(
      `数据库「${database}」不在授权列表中。可配置 ANALYTICS_MYSQL_DATABASE_ALLOWLIST，或设为 * 放开全部可见库`,
    );
  }
}

export function filterAllowedDatabaseNames(names: string[]) {
  const allowlist = getDatabaseAllowlist();

  if (!allowlist) {
    return names;
  }

  return names.filter((name) => allowlist.has(name.toLowerCase()));
}

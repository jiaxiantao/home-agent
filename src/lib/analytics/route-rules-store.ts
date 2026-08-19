import { isAppMysqlConfigured, queryAppMysql, executeAppMysql } from "@/lib/app-mysql/client";
import type { RowDataPacket } from "mysql2/promise";
import type { RouteKeywordRule } from "@/lib/analytics/question-router";

type RouteRuleRow = RowDataPacket & {
  id: string;
  pattern: string;
  databases: string | string[];
  search_terms: string | string[];
  reason: string;
  suggested_tables: string | Array<{ database: string; table: string }> | null;
  enabled: number;
  sort_order: number;
};

function parseJson<T>(value: string | T): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value;
}

function rowToRule(row: RouteRuleRow): RouteKeywordRule {
  const databases = parseJson<string[]>(row.databases);
  const searchTerms = parseJson<string[]>(row.search_terms);
  const suggestedTables = row.suggested_tables
    ? parseJson<Array<{ database: string; table: string }>>(row.suggested_tables)
    : undefined;

  return {
    pattern: new RegExp(row.pattern, "i"),
    databases,
    searchTerms,
    reason: row.reason,
    suggestedTables: suggestedTables?.length ? suggestedTables : undefined,
  };
}

let cachedRules: RouteKeywordRule[] | null = null;
let cacheTs = 0;
const CACHE_TTL_MS = 60_000;

export async function loadDynamicRouteRules(): Promise<RouteKeywordRule[]> {
  if (!isAppMysqlConfigured()) {
    return [];
  }

  const now = Date.now();
  if (cachedRules && now - cacheTs < CACHE_TTL_MS) {
    return cachedRules;
  }

  try {
    const rows = await queryAppMysql<RouteRuleRow>(
      `SELECT id, pattern, databases, search_terms, reason, suggested_tables, enabled, sort_order
       FROM route_rules WHERE enabled = 1 ORDER BY sort_order ASC, id ASC`,
    );
    cachedRules = rows.map(rowToRule);
    cacheTs = now;
    return cachedRules;
  } catch {
    return cachedRules ?? [];
  }
}

export function invalidateRouteRulesCache() {
  cachedRules = null;
  cacheTs = 0;
}

export type RouteRuleInput = {
  id?: string;
  pattern: string;
  databases: string[];
  searchTerms: string[];
  reason: string;
  suggestedTables?: Array<{ database: string; table: string }>;
  enabled?: boolean;
  sortOrder?: number;
};

export async function upsertRouteRule(input: RouteRuleInput) {
  const id = input.id || `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  new RegExp(input.pattern, "i");

  await executeAppMysql(
    `INSERT INTO route_rules (id, pattern, databases, search_terms, reason, suggested_tables, enabled, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       pattern = VALUES(pattern),
       databases = VALUES(databases),
       search_terms = VALUES(search_terms),
       reason = VALUES(reason),
       suggested_tables = VALUES(suggested_tables),
       enabled = VALUES(enabled),
       sort_order = VALUES(sort_order)`,
    [
      id,
      input.pattern,
      JSON.stringify(input.databases),
      JSON.stringify(input.searchTerms),
      input.reason,
      input.suggestedTables?.length ? JSON.stringify(input.suggestedTables) : null,
      input.enabled !== false ? 1 : 0,
      input.sortOrder ?? 0,
    ],
  );

  invalidateRouteRulesCache();
  return id;
}

export async function deleteRouteRule(id: string) {
  await executeAppMysql(`DELETE FROM route_rules WHERE id = ?`, [id]);
  invalidateRouteRulesCache();
}

export async function listRouteRules() {
  if (!isAppMysqlConfigured()) {
    return [];
  }
  const rows = await queryAppMysql<RouteRuleRow>(
    `SELECT * FROM route_rules ORDER BY sort_order ASC, id ASC`,
  );
  return rows;
}

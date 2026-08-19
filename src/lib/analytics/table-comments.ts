import { runAnalyticsQuery } from "@/lib/analytics/run-query";

export type TableComment = {
  database: string;
  table: string;
  comment: string;
};

export async function extractTableComments(database: string): Promise<TableComment[]> {
  try {
    const result = await runAnalyticsQuery(
      `SELECT TABLE_SCHEMA AS \`database\`, TABLE_NAME AS \`table\`, TABLE_COMMENT AS comment
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_COMMENT != '' AND TABLE_COMMENT IS NOT NULL
       ORDER BY TABLE_NAME`,
      [database],
    );
    return result.rows as TableComment[];
  } catch {
    return [];
  }
}

export async function extractColumnComments(
  database: string,
  table: string,
): Promise<Array<{ column: string; comment: string }>> {
  try {
    const result = await runAnalyticsQuery(
      `SELECT COLUMN_NAME AS \`column\`, COLUMN_COMMENT AS comment
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_COMMENT != '' AND COLUMN_COMMENT IS NOT NULL
       ORDER BY ORDINAL_POSITION`,
      [database, table],
    );
    return result.rows as Array<{ column: string; comment: string }>;
  } catch {
    return [];
  }
}

/**
 * Build search terms from table/column comments for route rule augmentation.
 * Extracts Chinese terms (2-6 chars) from comments to enhance routing.
 */
export function extractTermsFromComments(comments: string[]): string[] {
  const terms = new Set<string>();
  for (const comment of comments) {
    const chunks = comment.match(/[\u4e00-\u9fff]{2,6}/g) ?? [];
    for (const chunk of chunks) {
      terms.add(chunk);
    }
    const latin = comment.match(/[a-zA-Z][a-zA-Z0-9_]{2,20}/g) ?? [];
    for (const token of latin) {
      terms.add(token.toLowerCase());
    }
  }
  return [...terms].slice(0, 20);
}

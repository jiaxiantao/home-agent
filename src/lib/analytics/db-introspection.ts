import type { RowDataPacket } from "mysql2/promise";

import {
  getAnalyticsMysqlConfig,
  queryAnalyticsMysql,
  queryAnalyticsMysqlWithParams,
} from "@/lib/analytics/mysql";
import { listProjectDatabaseRegistry } from "@/lib/analytics/project-databases";
import { resolvePreferredOrDefaultDatabase } from "@/lib/analytics/preferred-database";
import {
  assertSqlIdentifier,
  quoteSqlIdentifier,
} from "@/lib/analytics/sql-identifier";
import { filterAllowedDatabaseNames } from "@/lib/security/database-allowlist";
import { assertTableNameAllowed, filterAllowedTableNames } from "@/lib/security/table-allowlist";
import { maskQueryRows } from "@/lib/security/pii-mask";

export type DatabaseInfo = {
  name: string;
  defaultCollation?: string;
  accessible: boolean;
};

export type TableInfo = {
  name: string;
  type: "BASE TABLE" | "VIEW" | string;
  engine?: string;
  rowEstimate?: number;
  dataLengthBytes?: number;
  indexLengthBytes?: number;
  comment?: string;
  createTime?: string;
  updateTime?: string;
};

export type ColumnInfo = {
  name: string;
  ordinalPosition: number;
  dataType: string;
  columnType: string;
  nullable: boolean;
  defaultValue: string | null;
  key: "" | "PRI" | "UNI" | "MUL";
  extra: string;
  comment: string;
  characterSet?: string;
  collation?: string;
};

export type IndexInfo = {
  name: string;
  unique: boolean;
  type: string;
  columns: Array<{
    name: string;
    seq: number;
    subPart?: number;
    collation?: string;
  }>;
};

export type ForeignKeyInfo = {
  name: string;
  table: string;
  column: string;
  referencedDatabase: string;
  referencedTable: string;
  referencedColumn: string;
  updateRule?: string;
  deleteRule?: string;
};

export type SchemaSearchHit = {
  kind: "table" | "column";
  database: string;
  table: string;
  column?: string;
  columnType?: string;
  comment?: string;
};

function resolveDatabase(database?: string) {
  return resolvePreferredOrDefaultDatabase(database);
}

function resolveTable(table: string) {
  return assertSqlIdentifier(table, "表");
}

function resolveColumn(column: string) {
  return assertSqlIdentifier(column, "字段");
}

function normalizeLikePattern(keyword: string) {
  const trimmed = keyword.trim();

  if (!trimmed) {
    throw new Error("搜索关键词不能为空");
  }

  if (trimmed.length > 64) {
    throw new Error("搜索关键词过长");
  }

  return `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`;
}

function formatBytes(value?: number | null) {
  if (value == null || value <= 0) {
    return undefined;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export async function introspectListDatabases(): Promise<DatabaseInfo[]> {
  const { rows } = await queryAnalyticsMysql<RowDataPacket[]>(
    "SHOW DATABASES",
  );

  const config = getAnalyticsMysqlConfig();
  const defaultDb = config?.database;
  const all = rows
    .map((row) => {
      const name = String(row.Database ?? row.SCHEMA_NAME ?? "");
      return {
        name,
        accessible: Boolean(name),
        defaultCollation: defaultDb === name ? "（当前默认库）" : undefined,
      };
    })
    .filter((item) => item.name);

  const allowedNames = new Set(
    filterAllowedDatabaseNames(all.map((item) => item.name)).map((name) =>
      name.toLowerCase(),
    ),
  );

  return all.filter((item) => allowedNames.has(item.name.toLowerCase()));
}

export async function introspectListProjectDatabases() {
  const registry = listProjectDatabaseRegistry();
  let live: DatabaseInfo[] = [];

  try {
    live = await introspectListDatabases();
  } catch {
    live = [];
  }

  const liveNames = new Set(live.map((item) => item.name));

  return {
    registry,
    liveAccessible: live,
    summary: registry.map((entry) => ({
      ...entry,
      accessible: liveNames.has(entry.name),
    })),
  };
}

export async function introspectListTables(options?: {
  database?: string;
  pattern?: string;
  includeViews?: boolean;
}) {
  const database = resolveDatabase(options?.database);
  const includeViews = options?.includeViews ?? true;
  const pattern = options?.pattern?.trim();

  let sql = `
    SELECT
      TABLE_NAME AS name,
      TABLE_TYPE AS type,
      ENGINE AS engine,
      TABLE_ROWS AS rowEstimate,
      DATA_LENGTH AS dataLengthBytes,
      INDEX_LENGTH AS indexLengthBytes,
      TABLE_COMMENT AS comment,
      CREATE_TIME AS createTime,
      UPDATE_TIME AS updateTime
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
  `;
  const params: unknown[] = [database];

  if (!includeViews) {
    sql += " AND TABLE_TYPE = 'BASE TABLE'";
  }

  if (pattern) {
    sql += " AND TABLE_NAME LIKE ? ESCAPE '\\\\'";
    params.push(normalizeLikePattern(pattern));
  }

  sql += " ORDER BY TABLE_NAME ASC LIMIT 500";

  const { rows } = await queryAnalyticsMysqlWithParams<RowDataPacket[]>(
    sql,
    params,
  );

  return rows
    .map((row) => ({
      name: String(row.name),
      type: String(row.type ?? "BASE TABLE"),
      engine: row.engine ? String(row.engine) : undefined,
      rowEstimate: row.rowEstimate != null ? Number(row.rowEstimate) : undefined,
      dataLengthBytes:
        row.dataLengthBytes != null ? Number(row.dataLengthBytes) : undefined,
      indexLengthBytes:
        row.indexLengthBytes != null ? Number(row.indexLengthBytes) : undefined,
      comment: row.comment ? String(row.comment) : undefined,
      createTime: row.createTime ? String(row.createTime) : undefined,
      updateTime: row.updateTime ? String(row.updateTime) : undefined,
    }))
    .filter((table) =>
      filterAllowedTableNames([table.name]).length > 0,
    ) satisfies TableInfo[];
}

export async function introspectDescribeTable(options: {
  database?: string;
  table: string;
}) {
  const database = resolveDatabase(options.database);
  const table = resolveTable(options.table);
  assertTableNameAllowed(table);

  const { rows } = await queryAnalyticsMysqlWithParams<RowDataPacket[]>(
    `
      SELECT
        COLUMN_NAME AS name,
        ORDINAL_POSITION AS ordinalPosition,
        DATA_TYPE AS dataType,
        COLUMN_TYPE AS columnType,
        IS_NULLABLE AS isNullable,
        COLUMN_DEFAULT AS defaultValue,
        COLUMN_KEY AS columnKey,
        EXTRA AS extra,
        COLUMN_COMMENT AS comment,
        CHARACTER_SET_NAME AS characterSet,
        COLLATION_NAME AS collation
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION ASC
    `,
    [database, table],
  );

  if (!rows.length) {
    throw new Error(`库 ${database} 中未找到表 ${table}`);
  }

  const columns = rows.map((row) => ({
    name: String(row.name),
    ordinalPosition: Number(row.ordinalPosition),
    dataType: String(row.dataType),
    columnType: String(row.columnType),
    nullable: String(row.isNullable).toUpperCase() === "YES",
    defaultValue: row.defaultValue == null ? null : String(row.defaultValue),
    key: (String(row.columnKey || "") || "") as ColumnInfo["key"],
    extra: String(row.extra ?? ""),
    comment: String(row.comment ?? ""),
    characterSet: row.characterSet ? String(row.characterSet) : undefined,
    collation: row.collation ? String(row.collation) : undefined,
  })) satisfies ColumnInfo[];

  return { database, table, columns };
}

export async function introspectGetColumn(options: {
  database?: string;
  table: string;
  column: string;
}) {
  const described = await introspectDescribeTable(options);
  const column = resolveColumn(options.column);
  const found = described.columns.find((item) => item.name === column);

  if (!found) {
    throw new Error(
      `表 ${described.database}.${described.table} 中未找到字段 ${column}`,
    );
  }

  return {
    database: described.database,
    table: described.table,
    column: found,
  };
}

export async function introspectListIndexes(options: {
  database?: string;
  table: string;
}) {
  const database = resolveDatabase(options.database);
  const table = resolveTable(options.table);
  assertTableNameAllowed(table);

  const { rows } = await queryAnalyticsMysqlWithParams<RowDataPacket[]>(
    `
      SELECT
        INDEX_NAME AS indexName,
        NON_UNIQUE AS nonUnique,
        INDEX_TYPE AS indexType,
        SEQ_IN_INDEX AS seqInIndex,
        COLUMN_NAME AS columnName,
        SUB_PART AS subPart,
        COLLATION AS collation
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY INDEX_NAME ASC, SEQ_IN_INDEX ASC
    `,
    [database, table],
  );

  if (!rows.length) {
    throw new Error(`库 ${database} 中未找到表 ${table} 或无索引信息`);
  }

  const indexMap = new Map<string, IndexInfo>();

  for (const row of rows) {
    const name = String(row.indexName);
    const existing = indexMap.get(name) ?? {
      name,
      unique: Number(row.nonUnique) === 0,
      type: String(row.indexType ?? "BTREE"),
      columns: [],
    };

    existing.columns.push({
      name: String(row.columnName),
      seq: Number(row.seqInIndex),
      subPart: row.subPart != null ? Number(row.subPart) : undefined,
      collation: row.collation ? String(row.collation) : undefined,
    });

    indexMap.set(name, existing);
  }

  return {
    database,
    table,
    indexes: [...indexMap.values()],
  };
}

export async function introspectListForeignKeys(options: {
  database?: string;
  table?: string;
}) {
  const database = resolveDatabase(options.database);
  const table = options.table ? resolveTable(options.table) : undefined;

  let sql = `
    SELECT
      k.CONSTRAINT_NAME AS constraintName,
      k.TABLE_NAME AS tableName,
      k.COLUMN_NAME AS columnName,
      k.REFERENCED_TABLE_SCHEMA AS referencedDatabase,
      k.REFERENCED_TABLE_NAME AS referencedTable,
      k.REFERENCED_COLUMN_NAME AS referencedColumn,
      r.UPDATE_RULE AS updateRule,
      r.DELETE_RULE AS deleteRule
    FROM information_schema.KEY_COLUMN_USAGE k
    LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
    WHERE k.CONSTRAINT_SCHEMA = ?
      AND k.REFERENCED_TABLE_NAME IS NOT NULL
  `;
  const params: unknown[] = [database];

  if (table) {
    sql += " AND k.TABLE_NAME = ?";
    params.push(table);
  }

  sql += " ORDER BY k.TABLE_NAME ASC, k.CONSTRAINT_NAME ASC LIMIT 200";

  const { rows } = await queryAnalyticsMysqlWithParams<RowDataPacket[]>(
    sql,
    params,
  );

  return {
    database,
    table,
    foreignKeys: rows.map((row) => ({
      name: String(row.constraintName),
      table: String(row.tableName),
      column: String(row.columnName),
      referencedDatabase: String(row.referencedDatabase),
      referencedTable: String(row.referencedTable),
      referencedColumn: String(row.referencedColumn),
      updateRule: row.updateRule ? String(row.updateRule) : undefined,
      deleteRule: row.deleteRule ? String(row.deleteRule) : undefined,
    })) satisfies ForeignKeyInfo[],
  };
}

export async function introspectShowCreateTable(options: {
  database?: string;
  table: string;
}) {
  const database = resolveDatabase(options.database);
  const table = resolveTable(options.table);
  assertTableNameAllowed(table);
  const qualified = `${quoteSqlIdentifier(database)}.${quoteSqlIdentifier(table)}`;

  const { rows } = await queryAnalyticsMysql<RowDataPacket[]>(
    `SHOW CREATE TABLE ${qualified}`,
  );

  const row = rows[0];

  if (!row) {
    throw new Error(`无法获取 ${database}.${table} 的建表语句`);
  }

  const ddl = String(row["Create Table"] ?? row["Create View"] ?? "");

  if (!ddl) {
    throw new Error(`无法获取 ${database}.${table} 的 DDL`);
  }

  return { database, table, ddl };
}

export async function introspectTableStats(options: {
  database?: string;
  table?: string;
}) {
  const database = resolveDatabase(options.database);
  const table = options.table ? resolveTable(options.table) : undefined;

  let sql = `
    SELECT
      TABLE_NAME AS tableName,
      TABLE_TYPE AS tableType,
      ENGINE AS engine,
      TABLE_ROWS AS rowEstimate,
      AVG_ROW_LENGTH AS avgRowLength,
      DATA_LENGTH AS dataLengthBytes,
      INDEX_LENGTH AS indexLengthBytes,
      DATA_FREE AS dataFreeBytes,
      AUTO_INCREMENT AS autoIncrement,
      TABLE_COMMENT AS comment,
      CREATE_TIME AS createTime,
      UPDATE_TIME AS updateTime
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
  `;
  const params: unknown[] = [database];

  if (table) {
    assertTableNameAllowed(table);
    sql += " AND TABLE_NAME = ?";
    params.push(table);
  }

  sql += " ORDER BY TABLE_NAME ASC LIMIT 500";

  const { rows } = await queryAnalyticsMysqlWithParams<RowDataPacket[]>(
    sql,
    params,
  );

  return {
    database,
    tables: rows.map((row) => ({
      name: String(row.tableName),
      type: String(row.tableType ?? "BASE TABLE"),
      engine: row.engine ? String(row.engine) : undefined,
      rowEstimate: row.rowEstimate != null ? Number(row.rowEstimate) : undefined,
      avgRowLength: row.avgRowLength != null ? Number(row.avgRowLength) : undefined,
      dataSize: formatBytes(Number(row.dataLengthBytes ?? 0)),
      indexSize: formatBytes(Number(row.indexLengthBytes ?? 0)),
      dataFree: formatBytes(Number(row.dataFreeBytes ?? 0)),
      autoIncrement: row.autoIncrement != null ? Number(row.autoIncrement) : undefined,
      comment: row.comment ? String(row.comment) : undefined,
      createTime: row.createTime ? String(row.createTime) : undefined,
      updateTime: row.updateTime ? String(row.updateTime) : undefined,
    })),
  };
}

export async function introspectSearchSchema(options: {
  database?: string;
  keyword: string;
  scope?: "all" | "tables" | "columns";
  limit?: number;
}) {
  const database = resolveDatabase(options.database);
  const scope = options.scope ?? "all";
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const pattern = normalizeLikePattern(options.keyword);
  const hits: SchemaSearchHit[] = [];

  if (scope === "all" || scope === "tables") {
    const { rows } = await queryAnalyticsMysqlWithParams<RowDataPacket[]>(
      `
        SELECT TABLE_NAME AS tableName, TABLE_COMMENT AS comment
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND (TABLE_NAME LIKE ? ESCAPE '\\\\' OR TABLE_COMMENT LIKE ? ESCAPE '\\\\')
        ORDER BY TABLE_NAME ASC
        LIMIT ?
      `,
      [database, pattern, pattern, limit],
    );

    for (const row of rows) {
      hits.push({
        kind: "table",
        database,
        table: String(row.tableName),
        comment: row.comment ? String(row.comment) : undefined,
      });
    }
  }

  if (scope === "all" || scope === "columns") {
    const remaining = limit - hits.length;

    if (remaining > 0) {
      const { rows } = await queryAnalyticsMysqlWithParams<RowDataPacket[]>(
        `
          SELECT
            TABLE_NAME AS tableName,
            COLUMN_NAME AS columnName,
            COLUMN_TYPE AS columnType,
            COLUMN_COMMENT AS comment
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ?
            AND (
              COLUMN_NAME LIKE ? ESCAPE '\\\\'
              OR COLUMN_TYPE LIKE ? ESCAPE '\\\\'
              OR COLUMN_COMMENT LIKE ? ESCAPE '\\\\'
            )
          ORDER BY TABLE_NAME ASC, ORDINAL_POSITION ASC
          LIMIT ?
        `,
        [database, pattern, pattern, pattern, remaining],
      );

      for (const row of rows) {
        hits.push({
          kind: "column",
          database,
          table: String(row.tableName),
          column: String(row.columnName),
          columnType: String(row.columnType),
          comment: row.comment ? String(row.comment) : undefined,
        });
      }
    }
  }

  return {
    database,
    keyword: options.keyword.trim(),
    scope,
    hits,
  };
}

export async function introspectSampleTableRows(options: {
  database?: string;
  table: string;
  limit?: number;
}) {
  const config = getAnalyticsMysqlConfig();
  const database = resolveDatabase(options.database);
  const table = resolveTable(options.table);
  assertTableNameAllowed(table);
  const limit = Math.min(
    Math.max(options.limit ?? 5, 1),
    config?.maxRows ?? 20,
  );
  const qualified = `${quoteSqlIdentifier(database)}.${quoteSqlIdentifier(table)}`;

  const { rows, fields } = await queryAnalyticsMysql<RowDataPacket[]>(
    `SELECT * FROM ${qualified} LIMIT ${limit}`,
  );

  const columns = fields.length > 0 ? fields : rows[0] ? Object.keys(rows[0]) : [];
  const serialized = (rows as Record<string, unknown>[]).map((row) => ({ ...row }));
  const masked = maskQueryRows(columns, serialized);

  return {
    database,
    table,
    limit,
    columns,
    rows: masked,
  };
}

export function formatDescribeTableOutput(result: Awaited<
  ReturnType<typeof introspectDescribeTable>
>) {
  const lines = result.columns.map(
    (col) =>
      `- ${col.name}: ${col.columnType}${col.key ? ` [${col.key}]` : ""}${col.nullable ? "" : " NOT NULL"}${col.comment ? ` — ${col.comment}` : ""}`,
  );

  return [`表 ${result.database}.${result.table} 共 ${result.columns.length} 个字段：`, ...lines].join(
    "\n",
  );
}

export function formatListTablesOutput(
  database: string,
  tables: TableInfo[],
) {
  if (!tables.length) {
    return `库 ${database} 下未找到匹配的表。`;
  }

  const lines = tables.map((table) => {
    const meta = [
      table.type,
      table.rowEstimate != null ? `~${table.rowEstimate} 行` : undefined,
      table.comment,
    ]
      .filter(Boolean)
      .join(" · ");

    return `- ${table.name}${meta ? ` (${meta})` : ""}`;
  });

  return [`库 ${database} 共 ${tables.length} 张表/视图：`, ...lines].join("\n");
}

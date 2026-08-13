import {
  buildChartSpecFromRows,
  parseChartType,
} from "@/lib/analytics/chart-spec";
import {
  formatDescribeTableOutput,
  formatListTablesOutput,
  introspectDescribeTable,
  introspectGetColumn,
  introspectListDatabases,
  introspectListForeignKeys,
  introspectListIndexes,
  introspectListProjectDatabases,
  introspectListTables,
  introspectRouteQuestion,
  introspectSampleTableRows,
  introspectSearchSchema,
  introspectShowCreateTable,
  introspectTableStats,
} from "@/lib/analytics/db-introspection";
import {
  formatSchemaCatalogForPrompt,
  listSchemaSummary,
} from "@/lib/analytics/schema-catalog";
import { runAnalyticsQuery } from "@/lib/analytics/run-query";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";
import { sanitizeAgentSql } from "@/lib/analytics/sql-sanitize";
import { assertAllowedDatabases } from "@/lib/security/database-allowlist";
import { assertAllowedTables } from "@/lib/security/table-allowlist";
import {
  runCallBackendApiTool,
  runRouteApiTool,
  runSearchApiTool,
} from "@/lib/mcp/dfc-api/agent-bridge";

import type {
  AgentToolName,
  AgentToolResult,
  BuildChartData,
  ExecuteSqlData,
  ProposeSqlData,
} from "@/lib/agent/types";

function readOptionalString(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return value == null || value === "" ? undefined : String(value).trim();
}

function readOptionalBoolean(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return String(value).toLowerCase() === "true";
}

function readOptionalNumber(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requireString(args: Record<string, unknown>, key: string, label: string) {
  const value = readOptionalString(args, key);
  if (!value) {
    throw new Error(`${label} 需要 ${key} 参数`);
  }
  return value;
}

function readFirstString(args: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readOptionalString(args, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export async function runAgentTool(
  tool: AgentToolName,
  args: Record<string, unknown>,
): Promise<{ output: string; data?: AgentToolResult["data"] }> {
  switch (tool) {
    case "list_project_databases": {
      const result = await introspectListProjectDatabases();
      const lines = result.summary.map((entry) => {
        const flags = [entry.accessible ? "可访问" : "未检测到权限"]
          .filter(Boolean)
          .join(" · ");
        return `- ${entry.name} [${entry.domain}/${entry.env}] — ${entry.description}${flags ? ` (${flags})` : ""}`;
      });

      return {
        output: [
          `大风车项目登记 ${result.registry.length} 个业务库；当前实例可见 ${result.liveAccessible.length} 个库。`,
          lines.join("\n"),
        ].join("\n"),
        data: result,
      };
    }
    case "list_databases": {
      const databases = await introspectListDatabases();
      const lines = databases.map((item) => `- ${item.name}`).join("\n");
      return {
        output: `当前账号可见 ${databases.length} 个数据库：\n${lines}`,
        data: { databases },
      };
    }
    case "list_tables": {
      const database = readOptionalString(args, "database");
      const pattern = readOptionalString(args, "pattern");
      const includeViews = readOptionalBoolean(args, "includeViews");
      const { database: resolvedDatabase, tables } = await introspectListTables({
        database,
        pattern,
        includeViews,
      });

      return {
        output: formatListTablesOutput(resolvedDatabase, tables),
        data: { database: resolvedDatabase, tables },
      };
    }
    case "describe_table": {
      const table = requireString(args, "table", "describe_table");
      const database = readOptionalString(args, "database");
      const result = await introspectDescribeTable({ database, table });
      return {
        output: formatDescribeTableOutput(result),
        data: result,
      };
    }
    case "get_column": {
      const table = requireString(args, "table", "get_column");
      const column = requireString(args, "column", "get_column");
      const database = readOptionalString(args, "database");
      const result = await introspectGetColumn({ database, table, column });
      const col = result.column;

      return {
        output: [
          `字段 ${result.database}.${result.table}.${col.name}`,
          `类型: ${col.columnType} (${col.dataType})`,
          `可空: ${col.nullable ? "是" : "否"}`,
          `键: ${col.key || "无"}`,
          `默认值: ${col.defaultValue ?? "NULL"}`,
          col.extra ? `Extra: ${col.extra}` : undefined,
          col.comment ? `注释: ${col.comment}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
        data: result,
      };
    }
    case "list_indexes": {
      const table = requireString(args, "table", "list_indexes");
      const database = readOptionalString(args, "database");
      const result = await introspectListIndexes({ database, table });
      const lines = result.indexes.map((index) => {
        const cols = index.columns.map((col) => col.name).join(", ");
        return `- ${index.name}${index.unique ? " [UNIQUE]" : ""} (${index.type}): ${cols}`;
      });

      return {
        output: [`表 ${result.database}.${result.table} 索引：`, ...lines].join("\n"),
        data: result,
      };
    }
    case "list_foreign_keys": {
      const database = readOptionalString(args, "database");
      const table = readOptionalString(args, "table");
      const result = await introspectListForeignKeys({ database, table });

      if (!result.foreignKeys.length) {
        return {
          output: table
            ? `表 ${result.database}.${table} 未找到外键。`
            : `库 ${result.database} 未找到外键。`,
          data: result,
        };
      }

      const lines = result.foreignKeys.map(
        (fk) =>
          `- ${fk.table}.${fk.column} → ${fk.referencedDatabase}.${fk.referencedTable}.${fk.referencedColumn} (${fk.name}, ON UPDATE ${fk.updateRule ?? "-"}, ON DELETE ${fk.deleteRule ?? "-"})`,
      );

      return {
        output: [`外键关系 ${result.foreignKeys.length} 条：`, ...lines].join("\n"),
        data: result,
      };
    }
    case "show_create_table": {
      const table = requireString(args, "table", "show_create_table");
      const database = readOptionalString(args, "database");
      const result = await introspectShowCreateTable({ database, table });
      return {
        output: result.ddl,
        data: result,
      };
    }
    case "get_table_stats": {
      const database = readOptionalString(args, "database");
      const table = readOptionalString(args, "table");
      const result = await introspectTableStats({ database, table });

      if (!result.tables.length) {
        return {
          output: table
            ? `库 ${result.database} 中未找到表 ${table}。`
            : `库 ${result.database} 无表统计信息。`,
          data: result,
        };
      }

      const lines = result.tables.map((item) => {
        const meta = [
          item.type,
          item.rowEstimate != null ? `~${item.rowEstimate} 行` : undefined,
          item.dataSize ? `数据 ${item.dataSize}` : undefined,
          item.indexSize ? `索引 ${item.indexSize}` : undefined,
          item.engine,
        ]
          .filter(Boolean)
          .join(" · ");
        return `- ${item.name}: ${meta}`;
      });

      return {
        output: [`库 ${result.database} 表统计：`, ...lines].join("\n"),
        data: result,
      };
    }
    case "search_schema": {
      const keyword = readFirstString(args, ["keyword", "query", "q", "search", "term"]);
      if (!keyword) {
        throw new Error("search_schema 需要 keyword 参数");
      }
      const database = readOptionalString(args, "database");
      const acrossRaw = readOptionalString(args, "acrossDatabases");
      const acrossDatabases =
        acrossRaw === "true" ||
        acrossRaw === "1" ||
        acrossRaw === "*" ||
        database === "*" ||
        readOptionalBoolean(args, "acrossDatabases") === true;
      const scopeRaw = readOptionalString(args, "scope");
      const scope =
        scopeRaw === "tables" || scopeRaw === "columns" || scopeRaw === "all"
          ? scopeRaw
          : "all";
      const limit = readOptionalNumber(args, "limit");
      const result = await introspectSearchSchema({
        database: acrossDatabases ? undefined : database,
        keyword,
        scope,
        limit,
        acrossDatabases,
      });

      if (!result.hits.length) {
        return {
          output: acrossDatabases
            ? `跨库未找到与「${result.keyword}」匹配的元数据。`
            : `库 ${result.database} 中未找到与「${result.keyword}」匹配的元数据。`,
          data: result,
        };
      }

      const lines = result.hits.map((hit) => {
        if (hit.kind === "table") {
          return `- [表] ${hit.database}.${hit.table}${hit.comment ? ` — ${hit.comment}` : ""}`;
        }
        return `- [字段] ${hit.database}.${hit.table}.${hit.column} (${hit.columnType})${hit.comment ? ` — ${hit.comment}` : ""}`;
      });

      return {
        output: [
          acrossDatabases
            ? `跨 ${result.databases.length} 个业务库找到 ${result.hits.length} 条匹配：`
            : `在 ${result.database} 中找到 ${result.hits.length} 条匹配：`,
          ...lines,
        ].join("\n"),
        data: result,
      };
    }
    case "route_api": {
      const question =
        readFirstString(args, ["question", "query", "message", "q"]) || "";
      if (!question) {
        throw new Error("route_api 需要 question 参数");
      }

      return runRouteApiTool({
        question,
        endpointId: readOptionalString(args, "endpointId"),
      });
    }
    case "search_api": {
      const keyword =
        readFirstString(args, ["keyword", "question", "query", "q"]) || "";
      if (!keyword) {
        throw new Error("search_api 需要 keyword 或 question 参数");
      }

      return runSearchApiTool({
        keyword,
        appCode: readOptionalString(args, "appCode"),
        entity: readOptionalString(args, "entity"),
        readOnlyOnly: readOptionalBoolean(args, "readOnlyOnly") !== false,
        limit: readOptionalNumber(args, "limit") ?? 15,
      });
    }
    case "call_backend_api": {
      const endpointId = requireString(args, "endpointId", "call_backend_api");
      const queryRaw = args.query;
      const bodyRaw = args.body;
      const query =
        queryRaw && typeof queryRaw === "object" && !Array.isArray(queryRaw)
          ? Object.fromEntries(
              Object.entries(queryRaw as Record<string, unknown>)
                .filter(([, v]) => v != null && String(v).trim() !== "")
                .map(([k, v]) => [k, String(v)]),
            )
          : undefined;
      const body =
        bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw)
          ? (bodyRaw as Record<string, unknown>)
          : undefined;

      return runCallBackendApiTool({
        endpointId,
        question: readOptionalString(args, "question"),
        phone: readOptionalString(args, "phone"),
        recordId: readOptionalString(args, "recordId"),
        shopCode: readOptionalString(args, "shopCode"),
        objCode: readOptionalString(args, "objCode"),
        plate: readOptionalString(args, "plate"),
        query,
        body,
      });
    }
    case "route_question": {
      const question =
        readFirstString(args, ["question", "query", "message", "q"]) || "";
      if (!question) {
        throw new Error("route_question 需要 question 参数");
      }
      const result = await introspectRouteQuestion({
        question,
        limitPerTerm: readOptionalNumber(args, "limitPerTerm"),
      });

      const candidateLines = result.candidates.map(
        (item) =>
          `- ${item.database} (score=${item.score}) — ${item.reasons.join("；")}${
            item.entry ? `｜${item.entry.description}` : ""
          }`,
      );
      const tableLines = result.topTables.map(
        (item) =>
          `- ${item.database}.${item.table}${item.comment ? ` — ${item.comment}` : ""}`,
      );

      return {
        output: [
          `问题路由「${result.question}」`,
          `搜索词：${result.searchTerms.join(", ") || "（无）"}`,
          "候选数据库：",
          candidateLines.join("\n") || "- （无）",
          "候选表：",
          tableLines.join("\n") || "- （暂无表名命中，请 list_tables / describe 已知表）",
          `建议库：${result.suggestedDatabase}${
            result.suggestedTable ? `，建议表：${result.suggestedTable}` : ""
          }`,
          ...(result.schemaSearchError
            ? [`元数据搜索降级：${result.schemaSearchError}`]
            : []),
          ...result.nextSteps.map((step) => `下一步：${step}`),
        ].join("\n"),
        data: result,
      };
    }
    case "sample_table_rows": {
      const table = requireString(args, "table", "sample_table_rows");
      const database = readOptionalString(args, "database");
      const limit = readOptionalNumber(args, "limit");
      const result = await introspectSampleTableRows({ database, table, limit });
      const preview = result.rows
        .slice(0, 5)
        .map((row) => JSON.stringify(row))
        .join("\n");

      return {
        output: [
          `表 ${result.database}.${result.table} 样例 ${result.rows.length} 行（LIMIT ${result.limit}）：`,
          preview || "（无数据）",
        ].join("\n"),
        data: result,
      };
    }
    case "list_schema": {
      const summary = listSchemaSummary();
      const detail = formatSchemaCatalogForPrompt();
      return {
        output: `已加载 ${summary.length} 张分析表目录（业务说明，非实时元数据）。\n${detail}`,
        data: { tables: summary },
      };
    }
    case "propose_sql": {
      const rawSql = String(args.sql ?? "").trim();
      const explanation = String(args.explanation ?? args.reason ?? "").trim();

      if (!rawSql) {
        throw new Error("propose_sql 需要 sql 参数");
      }

      const sanitized = sanitizeAgentSql(rawSql);
      const sql = sanitized.sql;

      const guarded = assertReadOnlySql(sql);

      if (!guarded.ok) {
        throw new Error(`SQL 未通过只读校验：${guarded.reason}`);
      }

      const allowlist = assertAllowedTables(guarded.sql);

      if (!allowlist.ok) {
        throw new Error(allowlist.reason);
      }

      const databases = assertAllowedDatabases(guarded.sql);

      if (!databases.ok) {
        throw new Error(databases.reason);
      }

      const data: ProposeSqlData = {
        sql: guarded.sql,
        explanation:
          sanitized.notes.length > 0
            ? `${explanation || "建议执行以下只读查询"}（${sanitized.notes.join("；")}）`
            : explanation || "建议执行以下只读查询",
      };

      return {
        output: `待确认 SQL：\n${data.sql}\n说明：${data.explanation}`,
        data,
      };
    }
    case "execute_sql": {
      const sql = String(args.sql ?? "").trim();

      if (!sql) {
        throw new Error("execute_sql 需要 sql 参数");
      }

      const result = await runAnalyticsQuery(sql);
      const data: ExecuteSqlData = result;
      const preview = result.rows
        .slice(0, 5)
        .map((row) => JSON.stringify(row))
        .join("\n");

      return {
        output: [
          `执行成功，返回 ${result.rowCount} 行${result.truncated ? "（已截断）" : ""}。`,
          `SQL: ${result.sql}`,
          preview ? `预览:\n${preview}` : "（无数据行）",
        ].join("\n"),
        data,
      };
    }
    case "build_chart": {
      const columns = Array.isArray(args.columns)
        ? args.columns.map(String)
        : [];
      const rows = Array.isArray(args.rows)
        ? (args.rows as Record<string, unknown>[])
        : [];
      const title = args.title ? String(args.title) : undefined;
      const preferredType = parseChartType(args.chartType ?? args.type);

      const chart = buildChartSpecFromRows(columns, rows, {
        title,
        preferredType,
      });
      const data: BuildChartData = { chart };

      return {
        output: chart
          ? `已生成 ${chart.type} 图（x=${chart.xKey}, y=${chart.yKey}）`
          : "当前结果不适合自动生成图表（可能是单指标或缺少类别列）",
        data,
      };
    }
    default:
      return { output: "未知工具" };
  }
}

export async function executeAgentTool(
  tool: AgentToolName,
  args: Record<string, unknown>,
): Promise<AgentToolResult> {
  const result = await runAgentTool(tool, args);
  return { tool, args, output: result.output, data: result.data };
}

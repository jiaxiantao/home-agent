import {
  buildChartSpecFromRows,
  parseChartType,
} from "@/lib/analytics/chart-spec";
import { runAnalyticsQuery } from "@/lib/analytics/run-query";
import {
  formatSchemaCatalogForPrompt,
  listSchemaSummary,
} from "@/lib/analytics/schema-catalog";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";
import { searchNotes } from "@/lib/note-search";

import type {
  AgentToolName,
  AgentToolResult,
  BuildChartData,
  ExecuteSqlData,
  ProposeSqlData,
} from "@/lib/agent/types";

function safeCalculate(expression: string) {
  const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "").trim();

  if (!sanitized || sanitized.length > 64) {
    throw new Error("表达式无效或过长");
  }

  const evaluate = new Function(`"use strict"; return (${sanitized})`) as () => number;
  const value = evaluate();

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("无法得到数值结果");
  }

  return value;
}

export async function runAgentTool(
  tool: AgentToolName,
  args: Record<string, unknown>,
): Promise<{ output: string; data?: AgentToolResult["data"] }> {
  switch (tool) {
    case "search_notes": {
      const query = String(args.query ?? "").trim();

      if (!query) {
        return { output: "未提供检索关键词。" };
      }

      let results;

      try {
        results = await searchNotes(query, 4);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[search_notes] query failed:", error);
        }

        return {
          output: [
            "笔记检索失败：无法连接数据库或表未初始化。",
            "请确认：1) docker compose up -d db  2) pnpm db:setup",
            "DATABASE_URL 需与 docker-compose 一致（默认库名 home_agent，密码 postgres）。",
          ].join("\n"),
        };
      }

      if (!results.length) {
        return { output: `未找到与「${query}」相关的笔记。` };
      }

      return {
        output: results
          .map(
            (note, index) =>
              `${index + 1}. ${note.title}（score ${note.score.toFixed(2)}）— ${note.summary ?? "无摘要"}`,
          )
          .join("\n"),
      };
    }
    case "calculate": {
      const expression = String(args.expression ?? "");
      const value = safeCalculate(expression);
      return { output: `${expression} = ${value}` };
    }
    case "current_time": {
      return {
        output: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      };
    }
    case "list_schema": {
      const summary = listSchemaSummary();
      const detail = formatSchemaCatalogForPrompt();
      return {
        output: `已加载 ${summary.length} 张分析表目录。\n${detail}`,
        data: { tables: summary },
      };
    }
    case "propose_sql": {
      const sql = String(args.sql ?? "").trim();
      const explanation = String(args.explanation ?? args.reason ?? "").trim();

      if (!sql) {
        throw new Error("propose_sql 需要 sql 参数");
      }

      const guarded = assertReadOnlySql(sql);

      if (!guarded.ok) {
        throw new Error(`SQL 未通过只读校验：${guarded.reason}`);
      }

      const data: ProposeSqlData = {
        sql: guarded.sql,
        explanation: explanation || "建议执行以下只读查询",
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

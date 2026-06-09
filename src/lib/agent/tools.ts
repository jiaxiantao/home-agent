import { searchNotes } from "@/lib/note-search";

import type { AgentToolName, AgentToolResult } from "@/lib/agent/types";

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
): Promise<string> {
  switch (tool) {
    case "search_notes": {
      const query = String(args.query ?? "").trim();

      if (!query) {
        return "未提供检索关键词。";
      }

      let results;

      try {
        results = await searchNotes(query, 4);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[search_notes] query failed:", error);
        }

        return [
          "笔记检索失败：无法连接数据库或表未初始化。",
          "请确认：1) docker compose up -d db  2) pnpm db:setup",
          "DATABASE_URL 需与 docker-compose 一致（默认库名 home_agent，密码 postgres）。",
        ].join("\n");
      }

      if (!results.length) {
        return `未找到与「${query}」相关的笔记。`;
      }

      return results
        .map(
          (note, index) =>
            `${index + 1}. ${note.title}（score ${note.score.toFixed(2)}）— ${note.summary ?? "无摘要"}`,
        )
        .join("\n");
    }
    case "calculate": {
      const expression = String(args.expression ?? "");
      const value = safeCalculate(expression);
      return `${expression} = ${value}`;
    }
    case "current_time": {
      return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    }
    default:
      return "未知工具";
  }
}

export async function executeAgentTool(
  tool: AgentToolName,
  args: Record<string, unknown>,
): Promise<AgentToolResult> {
  const output = await runAgentTool(tool, args);
  return { tool, args, output };
}

import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { agentToolCatalog } from "@/lib/agent/tool-catalog";
import { runAgentTool } from "@/lib/agent/tools";
import type { AgentToolName } from "@/lib/agent/types";

const jsonSchema = z.record(z.string(), z.unknown());

const toolSchemas: Partial<Record<AgentToolName, z.ZodType>> = {
  search_schema: z.object({
    keyword: z.string().optional().describe("搜索关键词"),
    query: z.string().optional().describe("keyword 别名"),
    q: z.string().optional(),
    search: z.string().optional(),
    term: z.string().optional(),
    database: z.string().optional(),
    acrossDatabases: z.union([z.boolean(), z.string()]).optional(),
    scope: z.string().optional(),
    limit: z.number().optional(),
  }),
  route_question: z.object({
    question: z.string().optional(),
    query: z.string().optional().describe("question 别名"),
    message: z.string().optional(),
    q: z.string().optional(),
    limitPerTerm: z.number().optional(),
  }),
  describe_table: z.object({
    table: z.string(),
    database: z.string().optional(),
  }),
  route_api: z.object({
    question: z.string().optional(),
    query: z.string().optional(),
    message: z.string().optional(),
    endpointId: z.string().optional(),
  }),
  search_api: z.object({
    keyword: z.string().optional(),
    question: z.string().optional(),
    query: z.string().optional(),
    appCode: z.string().optional(),
    entity: z.string().optional(),
    readOnlyOnly: z.boolean().optional(),
    limit: z.number().optional(),
  }),
  propose_sql: z.object({
    sql: z.string(),
    explanation: z.string().optional(),
  }),
};

function wrapAgentTool(name: AgentToolName, description: string) {
  return tool(
    async (input) => {
      const result = await runAgentTool(name, input as Record<string, unknown>);
      return JSON.stringify({
        output: result.output,
        data: result.data ?? null,
      });
    },
    {
      name,
      description,
      schema: toolSchemas[name] ?? jsonSchema,
    },
  );
}

/** LangChain StructuredTool 列表（不含 execute_sql，由 HITL 后执行） */
export function createLangChainTools() {
  return agentToolCatalog
    .filter((entry) => entry.name !== "execute_sql")
    .map((entry) =>
      wrapAgentTool(
        entry.name,
        `${entry.label}：${entry.description}`,
      ),
    );
}

export function parseToolResult(raw: string): {
  output: string;
  data?: Record<string, unknown> | null;
} {
  try {
    const parsed = JSON.parse(raw) as {
      output?: string;
      data?: Record<string, unknown> | null;
    };
    return {
      output: parsed.output ?? raw,
      data: parsed.data ?? undefined,
    };
  } catch {
    return { output: raw };
  }
}

export function toolResultToPrior(
  toolName: string,
  args: Record<string, unknown>,
  raw: string,
): import("@/lib/agent/types").AgentToolResult {
  const parsed = parseToolResult(raw);
  return {
    tool: toolName as import("@/lib/agent/types").AgentToolName,
    args,
    output: parsed.output,
    data: parsed.data as import("@/lib/agent/types").AgentToolResult["data"],
  };
}

export async function runExecuteSqlTool(sql: string) {
  return runAgentTool("execute_sql", { sql });
}

export async function runBuildChartTool(args: Record<string, unknown>) {
  return runAgentTool("build_chart", args);
}

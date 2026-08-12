import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { agentToolCatalog } from "@/lib/agent/tool-catalog";
import { runAgentTool } from "@/lib/agent/tools";
import type { AgentToolName } from "@/lib/agent/types";

const jsonSchema = z.record(z.string(), z.unknown());

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
      schema: jsonSchema,
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

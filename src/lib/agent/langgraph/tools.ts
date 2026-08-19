import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

import { getActiveAgentToolCatalog } from "@/lib/agent/managed-tools";
import { getToolCatalogVersion } from "@/lib/agent/tool-catalog-version";
import { runAgentTool } from "@/lib/agent/tools";
import type { AgentToolName } from "@/lib/agent/types";
import {
  stripUntrustedWrapper,
  wrapUntrustedData,
} from "@/lib/agent/untrusted-data";
import { isToolAllowedForUser, resolveUserRole } from "@/lib/security/rbac";

const jsonSchema = z.record(z.string(), z.unknown());

/**
 * 模型面向的参数只保留规范名。历史上这里为每个字段列出 keyword/query/q/search/term
 * 等别名，等于把模型的不稳定固化进 schema；现在改为在 wrapper 里归一化，
 * schema 只描述唯一正确的写法。
 */
const toolSchemas: Partial<Record<AgentToolName, z.ZodType>> = {
  search_schema: z.object({
    keyword: z.string().describe("搜索关键词，如「客户手机号」「车源 价格」"),
    database: z.string().optional().describe("限定库名，不传则按问题语义自动选择"),
    acrossDatabases: z.boolean().optional().describe("是否跨库检索"),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  route_question: z.object({
    question: z.string().describe("用户原问题原文"),
    limitPerTerm: z.number().int().min(1).max(50).optional(),
  }),
  describe_table: z.object({
    table: z.string().describe("表名，跨库时写 db.table"),
    database: z.string().optional(),
  }),
  route_api: z.object({
    question: z.string().describe("用户原问题原文，用于在全量接口目录打分"),
    endpointId: z.string().optional().describe("已知 endpointId 时直接校验"),
  }),
  search_api: z.object({
    keyword: z.string().describe("检索词，可用业务实体或接口路径片段"),
    appCode: z.string().optional().describe("限定服务，如 super-mario"),
    entity: z.string().optional().describe("限定实体，如 crm_customer / car"),
    readOnlyOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  propose_sql: z.object({
    sql: z.string().describe("单条只读 SELECT/SHOW/DESCRIBE/EXPLAIN"),
    explanation: z.string().describe("给用户看的一句话说明：查什么、用哪张表"),
  }),
  call_backend_api: z.object({
    endpointId: z.string().describe("来自 route_api / search_api 候选的 id"),
    question: z.string().optional().describe("用户原问题，自动提取 phone/recordId/plate"),
    phone: z.string().optional().describe("手机号或微信号"),
    recordId: z.string().optional().describe("CRM 客户 id"),
    objCode: z.string().optional().describe("CRM 对象，默认 customer；查车用 car"),
    plate: z.string().optional().describe("车牌号，queryRecordPageInfo 的 keywords"),
    query: z.record(z.string(), z.string()).optional().describe("catalog 模板外的额外 query"),
    body: z.record(z.string(), z.unknown()).optional().describe("catalog 模板外的额外 body"),
  }),
};

/**
 * 模型经常用同义字段名调用工具。与其把别名写进 schema 让模型更困惑，
 * 不如在调用前静默归一化——省掉一次「参数错误 → 重试」的往返。
 */
const ARG_ALIASES: Partial<Record<AgentToolName, Record<string, string>>> = {
  search_schema: { query: "keyword", q: "keyword", search: "keyword", term: "keyword" },
  route_question: { query: "question", message: "question", q: "question" },
  route_api: { query: "question", message: "question", q: "question", keyword: "question" },
  search_api: { query: "keyword", question: "keyword", q: "keyword", term: "keyword" },
};

export function normalizeToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const aliases = ARG_ALIASES[toolName];
  if (!aliases) {
    return args;
  }

  const normalized: Record<string, unknown> = { ...args };
  for (const [alias, canonical] of Object.entries(aliases)) {
    const value = normalized[alias];
    if (value == null || value === "") {
      continue;
    }
    if (normalized[canonical] == null || normalized[canonical] === "") {
      normalized[canonical] = value;
    }
    delete normalized[alias];
  }
  return normalized;
}

function wrapAgentTool(name: string, description: string) {
  const schema = toolSchemas[name] ?? jsonSchema;

  return tool(
    async (input) => {
      const args = normalizeToolArgs(name, (input ?? {}) as Record<string, unknown>);
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        // 抛出让 ToolNode 转成 error ToolMessage，模型下一步据此自修，而不是整轮失败
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("；");
        throw new Error(`工具 ${name} 参数不合法（${issues}）。请按 schema 修正参数后重新调用。`);
      }

      const result = await runAgentTool(name, parsed.data as Record<string, unknown>);
      return wrapUntrustedData(
        JSON.stringify({ output: result.output, data: result.data ?? null }),
      );
    },
    { name, description, schema },
  );
}

type ToolCacheEntry = {
  tools: StructuredToolInterface[];
  version: number;
  expiresAt: number;
};

const TOOL_CACHE_TTL_MS = 30_000;
const toolCache = new Map<string, ToolCacheEntry>();

export function invalidateLangChainToolCache() {
  toolCache.clear();
}

/**
 * LangChain StructuredTool 列表。
 * - 不含 execute_sql：必须先 propose_sql 走 HITL 确认
 * - 按角色过滤：管理员专属工具不进入非管理员的 schema，模型看不到就不会去调
 * - 带 TTL + 版本号缓存：规划节点与 ToolNode 每步各调一次，直连 Redis/MySQL 是纯浪费
 */
export async function createLangChainTools(options: { userId?: string } = {}) {
  const role = options.userId ? resolveUserRole(options.userId) : "analyst";
  const version = getToolCatalogVersion();
  const now = Date.now();

  const cached = toolCache.get(role);
  if (cached && cached.version === version && cached.expiresAt > now) {
    return cached.tools;
  }

  const catalog = await getActiveAgentToolCatalog();
  const tools = catalog
    .filter((entry) => entry.name !== "execute_sql")
    .filter((entry) => isToolAllowedForUser(entry.name, options.userId))
    .map((entry) => wrapAgentTool(entry.name, `${entry.label}：${entry.description}`));

  toolCache.set(role, { tools, version, expiresAt: now + TOOL_CACHE_TTL_MS });
  return tools;
}

export function parseToolResult(raw: string): {
  output: string;
  data?: Record<string, unknown> | null;
} {
  const payload = stripUntrustedWrapper(raw);
  try {
    const parsed = JSON.parse(payload) as {
      output?: string;
      data?: Record<string, unknown> | null;
    };
    return {
      output: parsed.output ?? payload,
      data: parsed.data ?? undefined,
    };
  } catch {
    return { output: payload };
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

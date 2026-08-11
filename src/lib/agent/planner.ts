import OpenAI from "openai";

import { formatSchemaCatalogForPrompt } from "@/lib/analytics/schema-catalog";
import { formatProjectDatabasesForPrompt } from "@/lib/analytics/project-databases";
import { getPreferredAnalyticsDatabase } from "@/lib/analytics/preferred-database";
import { getAgentMaxSteps } from "@/lib/agent/config";
import { truncatePriorForPlanner } from "@/lib/agent/planner-context";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import { parsePlanFromLlm } from "@/lib/agent/planner-schema";
import type { AgentToolResult } from "@/lib/agent/types";
import { getLlmConfig, isLlmConfigured } from "@/lib/llm-config";

function getPlannerSystem() {
  const preferred = getPreferredAnalyticsDatabase();
  const preferredHint = preferred
    ? `当前会话偏好分析库：${preferred}。元数据工具省略 database 时使用该库；业务 SQL 请优先写 \`${preferred}\`.\`table\`。`
    : "未指定会话偏好库时，元数据工具默认连接库（通常是 matador）。";

  return `你是大风车（车牛）数据分析助手的规划器。用户用自然语言问数或探索数据库结构，你调用合适的工具；业务查询需 propose_sql 经用户确认后再执行。

## 重要：多库分析
大风车在同一 MySQL 实例上有多个业务库（不止 matador）。${preferredHint}
- 用户提到具体库名时，元数据工具必须传 database 参数
- 跨库或非默认库的业务 SQL 必须使用限定名：\`database\`.\`table\`（禁止 USE）
- 不确定有哪些库时先 list_project_databases 或 list_databases

## 大风车业务库登记
${formatProjectDatabasesForPrompt()}

## 数据库元数据工具（只读，可直接调用，无需用户确认 SQL）
- list_project_databases: {} — 大风车项目已知业务库说明 + 当前连接可见库
- list_databases: {} — 当前授权可见的数据库列表
- list_tables: { database?: string, pattern?: string, includeViews?: boolean } — 列出库中的表/视图
- describe_table: { table: string, database?: string } — 表的全部字段、类型、键、注释
- get_column: { table: string, column: string, database?: string } — 单个字段详情
- list_indexes: { table: string, database?: string } — 表索引
- list_foreign_keys: { database?: string, table?: string } — 外键关系
- show_create_table: { table: string, database?: string } — SHOW CREATE TABLE DDL
- get_table_stats: { database?: string, table?: string } — 行数估计、存储大小
- search_schema: { keyword: string, database?: string, scope?: "all"|"tables"|"columns", limit?: number } — 搜索表/字段名与注释
- sample_table_rows: { table: string, database?: string, limit?: number } — 预览样例行
- list_schema: {} — matador 手写业务表目录（非实时）

## 数据分析工具
- propose_sql: { sql: string, explanation: string } — 提出待确认的只读 SQL（不要直接 execute_sql）
- build_chart: { columns: string[], rows: object[], title?: string, chartType?: "bar"|"line"|"pie" } — 根据查询结果生成图表

## 策略
1. 问「有哪些库/数据库/大风车库」→ list_project_databases 或 list_databases
2. 问「某库有哪些表」→ list_tables，并传入 database
3. 问「某表有哪些字段/xx 字段什么类型」→ describe_table 或 get_column（带 database）
4. 问「索引/外键/建表语句/表大小」→ 对应元数据工具
5. 不确定表名时 → search_schema（可限定 database）
6. 业务统计/聚合 → propose_sql（禁止 planner 调用 execute_sql）；非 matador 默认场景请限定库名
7. 每次只调用一个工具。最多 ${getAgentMaxSteps()} 步
8. SQL 必须单条只读 SELECT/SHOW/DESCRIBE/EXPLAIN；正式数据 test_type=0；订单 delete_time IS NULL

## matador 核心表目录（参考，其他库请先 introspect）
${formatSchemaCatalogForPrompt()}

只输出 JSON：
1) {"action":"tool","tool":"...","args":{...},"reasoning":"..."}
2) {"action":"answer","answer":"...","reasoning":"..."}`;
}

let cachedClient: OpenAI | null = null;
let cachedClientKey = "";

function getClient() {
  const { baseURL, apiKey } = getLlmConfig();
  const clientKey = `${baseURL}\0${apiKey}`;

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = new OpenAI({ apiKey, baseURL });
    cachedClientKey = clientKey;
  }

  return cachedClient;
}

export type ThreadTurn = {
  role: "user" | "assistant";
  content: string;
  sql?: string;
};

function isLlmRequired() {
  const flag = process.env.LLM_REQUIRE?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function llmUnavailableAnswer(reason: string) {
  return {
    action: "answer" as const,
    answer: `LLM 规划器不可用：${reason}。请联系管理员检查 Ollama/API 配置，或暂时关闭 LLM_REQUIRE。`,
    reasoning: "生产环境禁止规则回退",
  };
}

export async function planAgentStep(
  message: string,
  prior: AgentToolResult[],
  conversation: ThreadTurn[] = [],
): Promise<{ plan: ReturnType<typeof buildMockPlan>; mock: boolean }> {
  if (!isLlmConfigured()) {
    if (isLlmRequired()) {
      return { plan: llmUnavailableAnswer("未配置 LLM"), mock: true };
    }

    return { plan: buildMockPlan(message, prior, conversation), mock: true };
  }

  const client = getClient();
  const { model } = getLlmConfig();

  const userPayload = {
    question: message,
    conversation: conversation.slice(-10),
    priorTools: truncatePriorForPlanner(prior),
  };

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: getPlannerSystem() },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("空规划结果");
    }

    const plan = parsePlanFromLlm(content);

    if (plan.action === "tool" && plan.tool === "execute_sql") {
      return {
        plan: {
          action: "tool",
          tool: "propose_sql",
          args: {
            sql: String(plan.args.sql ?? ""),
            explanation: String(plan.args.explanation ?? "请确认后执行"),
          },
          reasoning: "系统将执行改为先确认",
        },
        mock: false,
      };
    }

    return { plan, mock: false };
  } catch {
    if (isLlmRequired()) {
      return { plan: llmUnavailableAnswer("调用失败"), mock: true };
    }

    return { plan: buildMockPlan(message, prior, conversation), mock: true };
  }
}

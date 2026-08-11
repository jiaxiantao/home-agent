import OpenAI from "openai";

import { formatSchemaCatalogForPrompt } from "@/lib/analytics/schema-catalog";
import { formatProjectDatabasesForPrompt } from "@/lib/analytics/project-databases";
import { getPreferredAnalyticsDatabase } from "@/lib/analytics/preferred-database";
import { formatRouteHintForPrompt } from "@/lib/analytics/question-router";
import { getAgentMaxSteps } from "@/lib/agent/config";
import { truncatePriorForPlanner } from "@/lib/agent/planner-context";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import { parsePlanFromLlm } from "@/lib/agent/planner-schema";
import type { AgentToolResult } from "@/lib/agent/types";
import { getLlmConfig, isLlmConfigured } from "@/lib/llm-config";
import { PRODUCT_NAME_EN, PRODUCT_NAME_ZH } from "@/lib/product";

function getPlannerSystem() {
  const preferred = getPreferredAnalyticsDatabase();
  const preferredHint = preferred
    ? `当前会话用户指定偏好库：${preferred}（仅作加权，仍需根据问题语义验证）。`
    : "未指定偏好库：必须仅根据问题语义自动选择数据库，禁止默认假设 matador 或其他固定库。";

  return `你是「${PRODUCT_NAME_ZH}」（${PRODUCT_NAME_EN}）的规划器。
产品目标：用户只需自然语言描述要查的数据；你必须主动规划「查哪个库 → 哪张表 → 哪些字段/条件」，生成只读 SQL 供用户确认执行。用户不应手动选择数据库或表。

示例：「我想知道客户 id 为 xxx 的用户信息」→ route_question 推断库/表 → describe_table（可选）→ propose_sql → 等待确认。
禁止在无问题语义支撑时默认使用 matador；语义不明确时先 route_question / search_schema(acrossDatabases)。

## 自动规划铁律（业务问数）
1. 不要一上来就 propose_sql（除非 prior 里已有足够的库/表/字段信息）。
2. 标准路径：
   a) route_question({ question }) — 自动推断候选库与候选表
   b) 若表不确定：search_schema({ keyword, acrossDatabases: true }) 或 list_tables({ database })
   c) describe_table({ database, table }) — 确认字段与口径（已知核心表可跳过）
   d) propose_sql — SQL 必须使用 \`database\`.\`table\` 限定名
3. 用户已明确库名/表名时，可跳过对应步骤，但仍建议 describe_table 后再写 SQL。
4. 按 ID 查详情时：从问题提取 ID，写入 WHERE；客户/用户优先 matador.cheniu_user。
5. 每次只调用一个工具；最多 ${getAgentMaxSteps()} 步。

${preferredHint}

## 问题→库路由提示
${formatRouteHintForPrompt()}

## 大风车业务库登记
${formatProjectDatabasesForPrompt()}

## 工具
- route_question: { question: string } — 【优先】根据问题自动规划候选库/表，并跨库搜索元数据
- list_project_databases / list_databases — 列库
- list_tables: { database?, pattern?, includeViews? }
- describe_table / get_column / list_indexes / list_foreign_keys / show_create_table / get_table_stats
- search_schema: { keyword, database?, acrossDatabases?: true, scope?, limit? } — acrossDatabases=true 时跨授权业务库搜索
- sample_table_rows: { table, database?, limit? }
- list_schema: {} — 仅 matador 手写口径，不能替代跨库探索
- propose_sql: { sql, explanation } — 待确认只读 SQL（禁止直接 execute_sql）
- build_chart: { columns, rows, title?, chartType? }

## SQL 规则
- 单条只读 SELECT/SHOW/DESCRIBE/EXPLAIN；禁止 USE / 多语句
- 非默认库或跨库必须 \`db\`.\`table\`
- 正式车源/求购常用 test_type=0；订单 delete_time IS NULL；用户表 date_delete IS NULL

## matador 核心表（仅参考，其他库请 introspect）
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

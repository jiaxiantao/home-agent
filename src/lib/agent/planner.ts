import OpenAI from "openai";

import { formatSchemaCatalogForPrompt } from "@/lib/analytics/schema-catalog";
import { getAgentMaxSteps } from "@/lib/agent/config";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import { parsePlanFromLlm } from "@/lib/agent/planner-schema";
import type { AgentToolResult } from "@/lib/agent/types";
import { getLlmConfig, isLlmConfigured } from "@/lib/llm-config";

function getPlannerSystem() {
  return `你是大风车（车牛）数据分析助手的规划器。用户用自然语言问数，你生成只读 MySQL SQL，经用户确认后再执行。

可用工具：
- list_schema: {} — 查看分析库表目录
- propose_sql: { "sql": string, "explanation": string } — 提出待确认的只读 SQL（不要直接执行）
- build_chart: { "columns": string[], "rows": object[], "title"?: string, "chartType"?: "bar"|"line"|"pie" } — 根据已有查询结果生成图表
- search_notes: { "query": string } — 搜索本地知识库笔记（非业务库）
- calculate: { "expression": string } — 计算数学表达式
- current_time: {} — 返回当前时间

重要约束：
1. 业务问数必须先 propose_sql，绝不要调用 execute_sql（执行由用户确认后的系统完成）。
2. SQL 必须是单条只读：SELECT / SHOW / DESCRIBE / EXPLAIN；禁止写操作与多语句。
3. 使用 MySQL 方言；尽量带 LIMIT；正式车源/求购优先 test_type = 0；订单注意 delete_time IS NULL。
4. 每次只调用一个工具。最多 ${getAgentMaxSteps()} 步。
5. 已有 execute_sql 结果后，可用 build_chart，或直接 answer 总结数字。

分析库表目录：
${formatSchemaCatalogForPrompt()}

只输出 JSON，格式二选一：
1) 需要工具: {"action":"tool","tool":"...","args":{...},"reasoning":"..."}
2) 直接回答: {"action":"answer","answer":"...","reasoning":"..."}`;
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

export async function planAgentStep(
  message: string,
  prior: AgentToolResult[],
): Promise<{ plan: ReturnType<typeof buildMockPlan>; mock: boolean }> {
  if (!isLlmConfigured()) {
    return { plan: buildMockPlan(message, prior), mock: true };
  }

  const client = getClient();
  const { model } = getLlmConfig();

  const userPayload = {
    question: message,
    priorTools: prior.map((item) => ({
      tool: item.tool,
      args: item.args,
      output: item.output,
      data: item.data,
    })),
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

    // Harden: never let the model execute SQL directly.
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
    return { plan: buildMockPlan(message, prior), mock: true };
  }
}

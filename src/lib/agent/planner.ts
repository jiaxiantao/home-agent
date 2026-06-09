import OpenAI from "openai";

import { getAgentMaxSteps } from "@/lib/agent/config";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import { parsePlanFromLlm } from "@/lib/agent/planner-schema";
import type { AgentToolResult } from "@/lib/agent/types";
import { getLlmConfig, isLlmConfigured } from "@/lib/llm-config";

const plannerSystem = `你是前端 Agent 编排器的规划器。根据用户问题决定是否调用工具。

可用工具：
- search_notes: { "query": string } — 搜索知识库笔记
- calculate: { "expression": string } — 计算数学表达式
- current_time: {} — 返回当前时间

只输出 JSON，格式二选一：
1) 需要工具: {"action":"tool","tool":"search_notes|calculate|current_time","args":{...},"reasoning":"..."}
2) 直接回答: {"action":"answer","answer":"...","reasoning":"..."}

若问题明显需要多个工具，可分多步调用，每次只调用一个工具。最多 ${getAgentMaxSteps()} 步。`;

function getClient() {
  const { baseURL, apiKey } = getLlmConfig();
  return new OpenAI({ apiKey, baseURL });
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
    })),
  };

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: plannerSystem },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("空规划结果");
    }

    return { plan: parsePlanFromLlm(content), mock: false };
  } catch {
    return { plan: buildMockPlan(message, prior), mock: true };
  }
}

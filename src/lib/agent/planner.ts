import OpenAI from "openai";

import type { AgentPlan, AgentToolResult } from "@/lib/agent/types";
import { getLlmConfig, isLlmConfigured } from "@/lib/llm-config";

const plannerSystem = `你是前端 Agent 编排器的规划器。根据用户问题决定是否调用工具。

可用工具：
- search_notes: { "query": string } — 搜索知识库笔记
- calculate: { "expression": string } — 计算数学表达式
- current_time: {} — 返回当前时间

只输出 JSON，格式二选一：
1) 需要工具: {"action":"tool","tool":"search_notes|calculate|current_time","args":{...},"reasoning":"..."}
2) 直接回答: {"action":"answer","answer":"...","reasoning":"..."}

若问题明显需要多个工具，可分多步调用，每次只调用一个工具。`;

function getClient() {
  const { baseURL, apiKey } = getLlmConfig();
  return new OpenAI({ apiKey, baseURL });
}

function mockPlan(message: string, prior: AgentToolResult[]): AgentPlan {
  const normalized = message.trim();
  const wantsSearch = /笔记|检索|搜索|架构|性能|RAG|note/i.test(normalized);
  const wantsMath = /计算|等于|多少|\+|\-|\*|\//.test(normalized);
  const wantsTime = /几点|时间|现在几点|日期/.test(normalized);
  const mathMatch = normalized.match(/([\d.+\-*/()\s]+)/);

  const hasTool = (tool: AgentToolResult["tool"]) =>
    prior.some((item) => item.tool === tool);

  if (wantsSearch && !hasTool("search_notes")) {
    return {
      action: "tool",
      tool: "search_notes",
      args: {
        query:
          normalized.replace(/^(请|帮我)?(搜索|检索|查找)/, "").trim() ||
          "前端架构",
      },
      reasoning: "问题涉及知识库，先检索笔记",
    };
  }

  if (wantsMath && !hasTool("calculate") && mathMatch?.[1]?.trim()) {
    return {
      action: "tool",
      tool: "calculate",
      args: { expression: mathMatch[1].trim() },
      reasoning: "问题包含算式，继续执行计算",
    };
  }

  if (wantsTime && !hasTool("current_time")) {
    return {
      action: "tool",
      tool: "current_time",
      args: {},
      reasoning: "用户提到时间，补充当前时刻",
    };
  }

  if (prior.length > 0) {
    const context = prior.map((item) => `${item.tool}: ${item.output}`).join("\n");
    return {
      action: "answer",
      answer: `（演示 Agent）已结合工具结果：\n${context}\n\n针对「${message}」的建议：优先查阅检索到的笔记并人工核对。`,
      reasoning: "演示模式：已有工具输出，合成最终回答",
    };
  }

  return {
    action: "answer",
    answer: `（演示 Agent）已理解你的问题：「${message}」。本地未启用 LLM 时不会继续推理，可在 .env 中配置 Ollama 或使用 LLM_DISABLED=0。`,
    reasoning: "无匹配工具，直接回答",
  };
}

function parsePlanJson(raw: string): AgentPlan {
  const parsed = JSON.parse(raw) as Partial<AgentPlan> & {
    action?: "tool" | "answer";
    tool?: AgentToolResult["tool"];
    args?: Record<string, unknown>;
    answer?: string;
    reasoning?: string;
  };

  if (parsed.action === "tool" && parsed.tool) {
    return {
      action: "tool",
      tool: parsed.tool,
      args: parsed.args ?? {},
      reasoning: parsed.reasoning?.trim() || `调用 ${parsed.tool} 完成当前步骤`,
    };
  }

  if (parsed.action === "answer" && parsed.answer) {
    return {
      action: "answer",
      answer: parsed.answer,
      reasoning: parsed.reasoning?.trim() || "基于已有信息直接回答",
    };
  }

  throw new Error("Planner JSON 格式无效");
}

export async function planAgentStep(
  message: string,
  prior: AgentToolResult[],
): Promise<{ plan: AgentPlan; mock: boolean }> {
  if (!isLlmConfigured()) {
    return { plan: mockPlan(message, prior), mock: true };
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

    return { plan: parsePlanJson(content), mock: false };
  } catch {
    return { plan: mockPlan(message, prior), mock: true };
  }
}

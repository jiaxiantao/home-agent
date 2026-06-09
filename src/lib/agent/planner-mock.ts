import type { AgentPlan, AgentToolResult } from "@/lib/agent/types";

export function buildMockPlan(message: string, prior: AgentToolResult[]): AgentPlan {
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

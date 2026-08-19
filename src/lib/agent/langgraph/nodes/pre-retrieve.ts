import { HumanMessage } from "@langchain/core/messages";

import { runAgentTool } from "@/lib/agent/tools";
import type { AgentToolResult } from "@/lib/agent/types";
import { clampMessageText } from "@/lib/agent/context-budget";
import { wrapUntrustedData } from "@/lib/agent/untrusted-data";

/**
 * 接口路由预检索。
 *
 * 提示词的「铁律 1」要求任何问数都先调 route_api，于是每个问题都要先烧掉一整轮
 * 规划 LLM 调用，只为拿一个本地打分器就能算出的结果。这里在进入循环前直接把
 * route_api 跑掉，把结论放进上下文，模型第一轮就能直接选 call_backend_api 或 propose_sql。
 *
 * 失败一律降级为 null：预检索是加速手段，不能成为新的故障点。
 */

const PRE_RETRIEVAL_TIMEOUT_MS = 4_000;

/** 纯元数据问题不涉及业务接口，跑路由只是白花时间 */
const SCHEMA_ONLY_PATTERN =
  /^(有哪些(库|表|字段)|列出(所有)?(库|表)|show\s+(databases|tables)|describe\s|desc\s|表结构|字段(有哪些|说明))/i;

export function shouldPreRetrieveApiRoute(question: string) {
  const trimmed = question.trim();
  if (trimmed.length < 2 || trimmed === "(resume)") {
    return false;
  }
  return !SCHEMA_ONLY_PATTERN.test(trimmed);
}

export type PreRetrievalResult = {
  prior: AgentToolResult;
  contextMessage: HumanMessage;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function preRetrieveApiRoute(
  question: string,
): Promise<PreRetrievalResult | null> {
  if (!shouldPreRetrieveApiRoute(question)) {
    return null;
  }

  let result: { output: string; data?: AgentToolResult["data"] } | null = null;
  try {
    result = await withTimeout(
      runAgentTool("route_api", { question }),
      PRE_RETRIEVAL_TIMEOUT_MS,
    );
  } catch {
    return null;
  }

  if (!result?.output?.trim()) {
    return null;
  }

  const prior: AgentToolResult = {
    tool: "route_api",
    args: { question },
    output: result.output,
    data: result.data,
  };

  const contextMessage = new HumanMessage(
    [
      "系统已自动完成接口路由（等价于 route_api 的结果），不要再调用一次 route_api。",
      "请据此直接推进：命中可调用的只读 HTTP 就 call_backend_api；没有合适接口再 search_api 扩检索，仍然没有才 propose_sql。",
      "",
      "路由结果：",
      wrapUntrustedData(clampMessageText(result.output, 1_200)),
    ].join("\n"),
  );

  return { prior, contextMessage };
}

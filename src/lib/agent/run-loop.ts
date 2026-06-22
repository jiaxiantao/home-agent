import { getAgentMaxSteps } from "@/lib/agent/config";
import { planAgentStep } from "@/lib/agent/planner";
import { executeAgentTool } from "@/lib/agent/tools";
import type { AgentTraceEvent, AgentToolResult } from "@/lib/agent/types";

function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  throw new Error("Agent request aborted");
}

function buildExhaustedAnswer(prior: AgentToolResult[], maxSteps: number) {
  if (!prior.length) {
    return `已达最大步数（${maxSteps}），请缩小问题范围后重试。`;
  }

  const context = prior.map((item) => `${item.tool}: ${item.output}`).join("\n");
  return `已达最大步数（${maxSteps}）。基于已有工具结果：\n${context}\n\n请缩小问题范围后重试。`;
}

export async function* runAgentLoop(
  message: string,
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<AgentTraceEvent> {
  const startedAt = performance.now();
  const prior: AgentToolResult[] = [];
  let steps = 0;
  let toolCalls = 0;

  yield { type: "trace", phase: "start", message: "Agent 循环启动" };

  const maxSteps = getAgentMaxSteps();

  while (steps < maxSteps) {
    assertNotAborted(options.signal);
    steps += 1;
    yield {
      type: "trace",
      phase: "plan",
      message: `第 ${steps} 步：规划是否需要工具`,
    };

    const planStartedAt = performance.now();
    const { plan, mock } = await planAgentStep(message, prior);
    const planMs = Math.round(performance.now() - planStartedAt);
    yield { type: "plan", plan };

    if (plan.action === "answer") {
      yield {
        type: "step_metric",
        step: steps,
        planMs,
        totalMs: Math.round(performance.now() - startedAt),
      };
      yield { type: "answer", text: plan.answer, mock };
      yield {
        type: "done",
        steps,
        toolCalls,
        totalMs: Math.round(performance.now() - startedAt),
      };
      return;
    }

    yield { type: "tool_call", tool: plan.tool, args: plan.args };
    toolCalls += 1;

    try {
      const toolStartedAt = performance.now();
      const result = await executeAgentTool(plan.tool, plan.args);
      const toolMs = Math.round(performance.now() - toolStartedAt);
      prior.push(result);
      yield { type: "tool_result", tool: plan.tool, output: result.output };
      yield {
        type: "step_metric",
        step: steps,
        planMs,
        toolMs,
        totalMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "工具执行失败",
      };
      return;
    }

    if (steps >= maxSteps) {
      break;
    }
  }

  yield {
    type: "trace",
    phase: "limit",
    message: `已达最大步数（${maxSteps}），合成最终回答`,
  };

  yield { type: "answer", text: buildExhaustedAnswer(prior, maxSteps) };
  yield {
    type: "done",
    steps,
    toolCalls,
    totalMs: Math.round(performance.now() - startedAt),
  };
}

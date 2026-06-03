import { executeAgentTool } from "@/lib/agent/tools";
import { planAgentStep } from "@/lib/agent/planner";
import type { AgentTraceEvent, AgentToolResult } from "@/lib/agent/types";

const MAX_STEPS = 4;

function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  throw new Error("Agent request aborted");
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

  while (steps < MAX_STEPS) {
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

    if (steps >= MAX_STEPS) {
      break;
    }
  }

  const { plan, mock } = await planAgentStep(message, prior);
  const text =
    plan.action === "answer"
      ? plan.answer
      : `已达最大步数（${MAX_STEPS}），请缩小问题范围后重试。`;

  yield { type: "answer", text, mock };
  yield {
    type: "done",
    steps,
    toolCalls,
    totalMs: Math.round(performance.now() - startedAt),
  };
}

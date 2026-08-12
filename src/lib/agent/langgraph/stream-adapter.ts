import type { AgentTraceEvent } from "@/lib/agent/types";

/** SSE 事件辅助：与前端 AgentTraceEvent 协议对齐 */
export function doneEvent(
  startedAt: number,
  steps: number,
  toolCalls: number,
): AgentTraceEvent {
  return {
    type: "done",
    steps,
    toolCalls,
    totalMs: Math.round(performance.now() - startedAt),
  };
}

export async function* emitTerminalError(
  message: string,
  startedAt: number,
  steps = 0,
  toolCalls = 0,
): AsyncGenerator<AgentTraceEvent> {
  yield { type: "error", message };
  yield doneEvent(startedAt, steps, toolCalls);
}

export function tracePlanStep(step: number): AgentTraceEvent {
  return {
    type: "trace",
    phase: "plan",
    message: `第 ${step} 步：LangGraph 规划/执行`,
  };
}

export function plannerModeEvent(mock: boolean): AgentTraceEvent {
  return {
    type: "planner_mode",
    mock,
    label: mock ? "规则规划器（LLM 未启用或调用失败）" : "LangChain 规划器",
  };
}

export function planStreamEvent(input: {
  step: number;
  text: string;
  delta: string;
}): AgentTraceEvent {
  return {
    type: "plan_stream",
    step: input.step,
    text: input.text,
    delta: input.delta,
  };
}

export function stepMetricEvent(input: {
  step: number;
  planMs: number;
  toolMs?: number;
  startedAt: number;
}): AgentTraceEvent {
  return {
    type: "step_metric",
    step: input.step,
    planMs: input.planMs,
    toolMs: input.toolMs,
    totalMs: Math.round(performance.now() - input.startedAt),
  };
}

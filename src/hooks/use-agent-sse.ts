"use client";

import { useCallback, useRef, useState } from "react";

import type { AgentPlan, AgentToolName, AgentTraceEvent } from "@/lib/agent/types";
import { parseSseBlock } from "@/lib/sse";

export type AgentTraceLine = {
  id: string;
  kind: string;
  text: string;
};

export type AgentStepMetric = {
  step: number;
  planMs: number;
  toolMs?: number;
  totalMs: number;
};

export type AgentRunStats = {
  steps: number;
  toolCalls: number;
  totalMs: number;
};

function formatPlan(plan: AgentPlan) {
  if (plan.action === "tool") {
    return `调用 ${plan.tool} · ${plan.reasoning || "执行工具步骤"}`;
  }

  return `直接回答 · ${plan.reasoning || "生成最终回答"}`;
}

function formatToolResult(tool: AgentToolName, output: string) {
  if (tool === "search_notes") {
    if (/^未找到与「.+」相关的笔记。$/.test(output)) {
      return `检索结果：未命中\n${output}`;
    }

    const hitCount = output
      .split("\n")
      .filter((line) => /^\d+\.\s/.test(line.trim())).length;

    if (hitCount > 0) {
      return `检索结果：命中 ${hitCount} 条\n${output}`;
    }
  }

  return output;
}

function traceLineFromEvent(payload: AgentTraceEvent): AgentTraceLine | null {
  const id = crypto.randomUUID();

  switch (payload.type) {
    case "trace":
      return { id, kind: "trace", text: `[${payload.phase}] ${payload.message}` };
    case "plan":
      return { id, kind: "plan", text: formatPlan(payload.plan) };
    case "tool_call":
      return {
        id,
        kind: "tool",
        text: `→ ${payload.tool}(${JSON.stringify(payload.args)})`,
      };
    case "tool_result":
      return {
        id,
        kind: "result",
        text: formatToolResult(payload.tool, payload.output),
      };
    case "error":
      return { id, kind: "error", text: payload.message };
    default:
      return null;
  }
}

export function useAgentStream(options?: { onEvent?: (event: AgentTraceEvent) => void }) {
  const [lines, setLines] = useState<AgentTraceLine[]>([]);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [stepMetrics, setStepMetrics] = useState<AgentStepMetric[]>([]);
  const [stats, setStats] = useState<AgentRunStats | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(options?.onEvent);

  onEventRef.current = options?.onEvent;

  const reset = useCallback(() => {
    setLines([]);
    setFinalAnswer("");
    setStats(null);
    setStepMetrics([]);
  }, []);

  const appendLine = useCallback((kind: string, text: string) => {
    setLines((current) => [
      ...current,
      { id: crypto.randomUUID(), kind, text },
    ]);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    appendLine("trace", "[client] 已手动停止");
  }, [appendLine]);

  const run = useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      reset();

      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message.trim() }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setLines([
            {
              id: crypto.randomUUID(),
              kind: "error",
              text: `HTTP ${response.status}`,
            },
          ]);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");

          while (boundary !== -1) {
            const block = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 2);

            const parsed = parseSseBlock(block);

            if (parsed?.payload) {
              const { payload } = parsed;
              onEventRef.current?.(payload);

              const line = traceLineFromEvent(payload);
              if (line) {
                setLines((current) => [...current, line]);
              }

              if (payload.type === "answer") {
                setFinalAnswer(payload.text);
              } else if (payload.type === "done") {
                setStats({
                  steps: payload.steps,
                  toolCalls: payload.toolCalls,
                  totalMs: payload.totalMs,
                });
              } else if (payload.type === "step_metric") {
                setStepMetrics((current) => [
                  ...current.filter((item) => item.step !== payload.step),
                  {
                    step: payload.step,
                    planMs: payload.planMs,
                    toolMs: payload.toolMs,
                    totalMs: payload.totalMs,
                  },
                ]);
              }
            }

            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLines((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              kind: "error",
              text: error instanceof Error ? error.message : "请求失败",
            },
          ]);
        }
      } finally {
        setRunning(false);
      }
    },
    [reset],
  );

  return {
    run,
    stop,
    reset,
    appendLine,
    running,
    lines,
    finalAnswer,
    stats,
    stepMetrics,
  };
}

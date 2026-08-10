"use client";

import { useCallback, useRef, useState } from "react";

import type { A2UISurface } from "@/lib/a2ui/types";
import type {
  AgentPlan,
  AgentResumeAction,
  AgentToolName,
  AgentTraceEvent,
} from "@/lib/agent/types";
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

export type AgentPhase =
  | "idle"
  | "planning"
  | "tool"
  | "awaiting"
  | "answering"
  | "done"
  | "error";

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
    case "awaiting_input":
      return {
        id,
        kind: "awaiting",
        text: `等待确认 SQL（runId=${payload.runId}）`,
      };
    case "a2ui":
      return {
        id,
        kind: "a2ui",
        text: `A2UI surface: ${payload.surface.title ?? payload.surface.surfaceId}`,
      };
    case "error":
      return { id, kind: "error", text: payload.message };
    default:
      return null;
  }
}

function phaseFromEvent(payload: AgentTraceEvent): AgentPhase | null {
  switch (payload.type) {
    case "trace":
      if (payload.phase === "plan") {
        return "planning";
      }
      if (payload.phase === "limit" || payload.phase === "resume") {
        return "answering";
      }
      return null;
    case "plan":
      return "planning";
    case "tool_call":
      return "tool";
    case "awaiting_input":
      return "awaiting";
    case "answer":
      return "answering";
    case "done":
      return "done";
    case "error":
      return "error";
    default:
      return null;
  }
}

async function consumeAgentStream(
  body: unknown,
  signal: AbortSignal,
  onPayload: (payload: AgentTraceEvent) => void,
) {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
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
        onPayload(parsed.payload);
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function useAgentStream(options?: { onEvent?: (event: AgentTraceEvent) => void }) {
  const [lines, setLines] = useState<AgentTraceLine[]>([]);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [isMock, setIsMock] = useState(false);
  const [stepMetrics, setStepMetrics] = useState<AgentStepMetric[]>([]);
  const [stats, setStats] = useState<AgentRunStats | null>(null);
  const [surfaces, setSurfaces] = useState<A2UISurface[]>([]);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(options?.onEvent);

  onEventRef.current = options?.onEvent;

  const reset = useCallback(() => {
    setLines([]);
    setFinalAnswer("");
    setStats(null);
    setStepMetrics([]);
    setPhase("idle");
    setCurrentStep(0);
    setIsMock(false);
    setSurfaces([]);
    setPendingRunId(null);
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
    setPhase("idle");
    appendLine("trace", "[client] 已手动停止");
  }, [appendLine]);

  const handlePayload = useCallback((payload: AgentTraceEvent) => {
    onEventRef.current?.(payload);

    const nextPhase = phaseFromEvent(payload);
    if (nextPhase) {
      setPhase(nextPhase);
    }

    const line = traceLineFromEvent(payload);
    if (line) {
      setLines((current) => [...current, line]);
    }

    if (payload.type === "answer") {
      setFinalAnswer(payload.text);
      setIsMock(Boolean(payload.mock));
    } else if (payload.type === "done") {
      setStats({
        steps: payload.steps,
        toolCalls: payload.toolCalls,
        totalMs: payload.totalMs,
      });
      setPhase("done");
    } else if (payload.type === "step_metric") {
      setCurrentStep(payload.step);
      setStepMetrics((current) => [
        ...current.filter((item) => item.step !== payload.step),
        {
          step: payload.step,
          planMs: payload.planMs,
          toolMs: payload.toolMs,
          totalMs: payload.totalMs,
        },
      ]);
    } else if (payload.type === "tool_call") {
      setCurrentStep((current) => current + 1);
    } else if (payload.type === "a2ui") {
      setSurfaces((current) => {
        const without = current.filter(
          (surface) => surface.surfaceId !== payload.surface.surfaceId,
        );
        return [...without, payload.surface];
      });
    } else if (payload.type === "awaiting_input") {
      setPendingRunId(payload.runId);
      setPhase("awaiting");
    }
  }, []);

  const run = useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      reset();
      setPhase("planning");

      try {
        await consumeAgentStream(
          { message: message.trim() },
          controller.signal,
          handlePayload,
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPhase("error");
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
    [handlePayload, reset],
  );

  const resume = useCallback(
    async (action: AgentResumeAction) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setPhase("tool");
      setPendingRunId(null);

      try {
        await consumeAgentStream(
          { message: "", resume: action },
          controller.signal,
          handlePayload,
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPhase("error");
          setLines((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              kind: "error",
              text: error instanceof Error ? error.message : "确认请求失败",
            },
          ]);
        }
      } finally {
        setRunning(false);
      }
    },
    [handlePayload],
  );

  return {
    run,
    resume,
    stop,
    reset,
    appendLine,
    running,
    phase,
    currentStep,
    isMock,
    lines,
    finalAnswer,
    stats,
    stepMetrics,
    surfaces,
    pendingRunId,
  };
}

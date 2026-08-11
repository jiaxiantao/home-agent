"use client";

import { useCallback, useRef, useState } from "react";

import type { A2UISurface } from "@/lib/a2ui/types";
import type {
  AgentPlan,
  AgentResumeAction,
  AgentToolName,
  AgentTraceEvent,
} from "@/lib/agent/types";
import {
  createHistoryEntry,
  updateQueryHistory,
  type QueryHistoryEntry,
} from "@/lib/history/query-history";
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

export type AgentActivityStep = {
  id: string;
  kind: "plan" | "tool" | "result" | "awaiting" | "error" | "trace";
  title: string;
  detail?: string;
  status: "running" | "done" | "error";
  tool?: AgentToolName;
};

export type ConversationTurn = {
  id: string;
  question: string;
  surfaces: A2UISurface[];
  finalAnswer: string;
  stats: AgentRunStats | null;
  isMock: boolean;
  status: "running" | "awaiting" | "done" | "error" | "cancelled";
  historyId?: string;
  steps: AgentActivityStep[];
};

const THREAD_STORAGE_KEY = "home-agent-thread-id";

function getStoredThreadId() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.sessionStorage.getItem(THREAD_STORAGE_KEY) ?? undefined;
}

function storeThreadId(threadId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(THREAD_STORAGE_KEY, threadId);
}

function formatPlan(plan: AgentPlan) {
  if (plan.action === "tool") {
    return `调用 ${plan.tool} · ${plan.reasoning || "执行工具步骤"}`;
  }

  return `直接回答 · ${plan.reasoning || "生成最终回答"}`;
}

function formatToolResult(tool: AgentToolName, output: string) {
  if (tool === "list_schema") {
    return `表目录已加载\n${output.slice(0, 500)}${output.length > 500 ? "…" : ""}`;
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
    case "planner_mode":
      return {
        id,
        kind: "trace",
        text: `[planner] ${payload.label ?? (payload.mock ? "规则模式" : "LLM")}`,
      };
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

export function useAgentStream() {
  const [lines, setLines] = useState<AgentTraceLine[]>([]);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [isMock, setIsMock] = useState(false);
  const [plannerLabel, setPlannerLabel] = useState<string | null>(null);
  const [stepMetrics, setStepMetrics] = useState<AgentStepMetric[]>([]);
  const [stats, setStats] = useState<AgentRunStats | null>(null);
  const [surfaces, setSurfaces] = useState<A2UISurface[]>([]);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>(getStoredThreadId);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [analyticsEnv, setAnalyticsEnv] = useState<string>("test");
  const [analyticsDatabase, setAnalyticsDatabase] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);
  const turnRef = useRef<ConversationTurn | null>(null);
  const historyRef = useRef<QueryHistoryEntry | null>(null);

  const resetCurrentTurn = useCallback(() => {
    setLines([]);
    setFinalAnswer("");
    setStats(null);
    setStepMetrics([]);
    setPhase("idle");
    setCurrentStep(0);
    setIsMock(false);
    setPlannerLabel(null);
    setSurfaces([]);
    setPendingRunId(null);
    turnRef.current = null;
    historyRef.current = null;
  }, []);

  const resetAll = useCallback(() => {
    resetCurrentTurn();
    setConversation([]);
    setCurrentQuestion("");
    const nextThread = `thread_${crypto.randomUUID().slice(0, 12)}`;
    setThreadId(nextThread);
    storeThreadId(nextThread);
  }, [resetCurrentTurn]);

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

  const updateTurn = useCallback((patch: Partial<ConversationTurn>) => {
    const current = turnRef.current;

    if (!current) {
      return;
    }

    const next = { ...current, ...patch };
    turnRef.current = next;
    setConversation((items) => {
      const without = items.filter((item) => item.id !== next.id);
      return [...without, next];
    });
  }, []);

  const appendTurnStep = useCallback((step: AgentActivityStep) => {
    const current = turnRef.current;

    if (!current) {
      return;
    }

    const next = {
      ...current,
      steps: [...current.steps, step],
    };
    turnRef.current = next;
    setConversation((items) => {
      const without = items.filter((item) => item.id !== next.id);
      return [...without, next];
    });
  }, []);

  const patchLastTurnStep = useCallback(
    (
      predicate: (step: AgentActivityStep) => boolean,
      patch: Partial<AgentActivityStep>,
    ) => {
      const current = turnRef.current;

      if (!current?.steps.length) {
        return;
      }

      const steps = [...current.steps];
      for (let index = steps.length - 1; index >= 0; index -= 1) {
        const step = steps[index];
        if (step && predicate(step)) {
          steps[index] = { ...step, ...patch };
          break;
        }
      }

      const next = { ...current, steps };
      turnRef.current = next;
      setConversation((items) => {
        const without = items.filter((item) => item.id !== next.id);
        return [...without, next];
      });
    },
    [],
  );

  const handlePayload = useCallback(
    (payload: AgentTraceEvent) => {
      const nextPhase = phaseFromEvent(payload);
      if (nextPhase) {
        setPhase(nextPhase);
      }

      const line = traceLineFromEvent(payload);
      if (line) {
        setLines((current) => [...current, line]);
      }

      if (payload.type === "thread") {
        setThreadId(payload.threadId);
        storeThreadId(payload.threadId);
      } else if (payload.type === "planner_mode") {
        setIsMock(payload.mock);
        setPlannerLabel(payload.label ?? null);
        updateTurn({ isMock: payload.mock });
      } else if (payload.type === "plan") {
        appendTurnStep({
          id: crypto.randomUUID(),
          kind: "plan",
          title: formatPlan(payload.plan),
          detail: payload.plan.reasoning,
          status: "done",
        });
      } else if (payload.type === "tool_call") {
        setCurrentStep((current) => current + 1);
        appendTurnStep({
          id: crypto.randomUUID(),
          kind: "tool",
          title: `调用 ${payload.tool}`,
          detail: JSON.stringify(payload.args, null, 2),
          status: "running",
          tool: payload.tool,
        });
      } else if (payload.type === "tool_result") {
        patchLastTurnStep(
          (step) => step.kind === "tool" && step.tool === payload.tool,
          {
            status: "done",
            title: `已完成 ${payload.tool}`,
          },
        );
        appendTurnStep({
          id: crypto.randomUUID(),
          kind: "result",
          title: `${payload.tool} 结果`,
          detail: formatToolResult(payload.tool, payload.output),
          status: "done",
          tool: payload.tool,
        });
      } else if (payload.type === "answer") {
        setFinalAnswer(payload.text);
        setIsMock(Boolean(payload.mock));
        updateTurn({
          finalAnswer: payload.text,
          isMock: Boolean(payload.mock),
          status: "done",
        });

        if (historyRef.current) {
          historyRef.current = updateQueryHistory(historyRef.current.id, {
            answer: payload.text,
            status: "done",
          }) ?? historyRef.current;
        }
      } else if (payload.type === "done") {
        const nextStats = {
          steps: payload.steps,
          toolCalls: payload.toolCalls,
          totalMs: payload.totalMs,
        };
        setStats(nextStats);
        const turnStatus = turnRef.current?.status;
        const nextStatus =
          turnStatus === "error" || turnStatus === "awaiting"
            ? turnStatus
            : "done";
        if (nextStatus === "done" || turnStatus === "error") {
          setPhase(nextStatus === "error" ? "error" : "done");
        }
        updateTurn({ stats: nextStats, status: nextStatus });
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
      } else if (payload.type === "a2ui") {
        setSurfaces((current) => {
          const without = current.filter(
            (surface) => surface.surfaceId !== payload.surface.surfaceId,
          );
          const next = [...without, payload.surface];
          updateTurn({ surfaces: next });
          return next;
        });
      } else if (payload.type === "awaiting_input") {
        setPendingRunId(payload.runId);
        setPhase("awaiting");
        updateTurn({ status: "awaiting" });
        appendTurnStep({
          id: crypto.randomUUID(),
          kind: "awaiting",
          title: "等待确认 SQL",
          detail: payload.explanation,
          status: "done",
        });

        if (historyRef.current) {
          historyRef.current = updateQueryHistory(historyRef.current.id, {
            sql: payload.sql,
            status: "awaiting",
          }) ?? historyRef.current;
        }
      } else if (payload.type === "error") {
        updateTurn({ status: "error" });
        appendTurnStep({
          id: crypto.randomUUID(),
          kind: "error",
          title: payload.message,
          status: "error",
        });

        if (historyRef.current) {
          historyRef.current = updateQueryHistory(historyRef.current.id, {
            status: "error",
          }) ?? historyRef.current;
        }
      }
    },
    [appendTurnStep, patchLastTurnStep, updateTurn],
  );

  const beginTurn = useCallback(
    (question: string) => {
      const turn: ConversationTurn = {
        id: crypto.randomUUID(),
        question,
        surfaces: [],
        finalAnswer: "",
        stats: null,
        isMock: false,
        status: "running",
        steps: [],
      };

      turnRef.current = turn;
      setConversation((current) => [...current, turn]);
      setCurrentQuestion(question);

      historyRef.current = createHistoryEntry({
        threadId: threadId ?? "unknown",
        question,
        status: "awaiting",
      });
      turn.historyId = historyRef.current.id;
    },
    [threadId],
  );

  const run = useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      resetCurrentTurn();
      beginTurn(message.trim());
      setPhase("planning");

      try {
        await consumeAgentStream(
          { message: message.trim(), threadId, analyticsEnv, analyticsDatabase: analyticsDatabase || undefined },
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
          updateTurn({ status: "error" });

          if (historyRef.current) {
            updateQueryHistory(historyRef.current.id, { status: "error" });
          }
        }
      } finally {
        setRunning(false);
      }
    },
    [beginTurn, handlePayload, resetCurrentTurn, threadId, analyticsEnv, analyticsDatabase],
  );

  const resume = useCallback(
    async (action: AgentResumeAction) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setPhase("tool");
      setPendingRunId(null);
      updateTurn({ status: "running" });

      if (action.actionId === "cancel_sql" && historyRef.current) {
        updateQueryHistory(historyRef.current.id, { status: "cancelled" });
        updateTurn({ status: "cancelled" });
      }

      try {
        await consumeAgentStream(
          { message: "", threadId, analyticsEnv, analyticsDatabase: analyticsDatabase || undefined, resume: action },
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
    [handlePayload, threadId, updateTurn, analyticsEnv, analyticsDatabase],
  );

  const loadHistoryQuestion = useCallback((question: string) => {
    setCurrentQuestion(question);
  }, []);

  return {
    run,
    resume,
    stop,
    reset: resetAll,
    resetCurrentTurn,
    appendLine,
    running,
    phase,
    currentStep,
    isMock,
    plannerLabel,
    lines,
    finalAnswer,
    stats,
    stepMetrics,
    surfaces,
    pendingRunId,
    threadId,
    conversation,
    currentQuestion,
    loadHistoryQuestion,
    analyticsEnv,
    setAnalyticsEnv,
    analyticsDatabase,
    setAnalyticsDatabase,
  };
}

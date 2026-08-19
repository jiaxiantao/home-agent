import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

import type { AgentToolResult, ProposeSqlData } from "@/lib/agent/types";

export type PendingSqlState = ProposeSqlData & { runId?: string };

export const DfcAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  userMessage: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  priorToolResults: Annotation<AgentToolResult[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  stepCount: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0,
  }),
  /** 累计工具调用次数，用于 done 事件的统计；与 stepCount 不同，一步可并行调多个工具 */
  toolCallCount: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0,
  }),
  mock: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false,
  }),
  pendingSql: Annotation<PendingSqlState | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  finalAnswer: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  shouldEnd: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false,
  }),
  /** 规划失败等终止性错误：置位后图直接收敛到 END，不再进 finalize */
  terminalError: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  /** HITL 已挂起等待用户确认，本次运行到此为止 */
  awaitingInput: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false,
  }),
  /** 最近一步的规划耗时，供 step_metric 使用 */
  lastPlanMs: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0,
  }),
});

export type DfcAgentStateType = typeof DfcAgentState.State;

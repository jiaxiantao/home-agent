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
});

export type DfcAgentStateType = typeof DfcAgentState.State;

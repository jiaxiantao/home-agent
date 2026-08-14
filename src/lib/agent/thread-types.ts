import type { A2UISurface } from "@/lib/a2ui/types";
import type {
  ThreadActivityStep,
  ThreadTurnStats,
} from "@/lib/agent/thread-ui";

export type ThreadMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
  sql?: string;
  surfaces?: A2UISurface[];
  steps?: ThreadActivityStep[];
  stats?: ThreadTurnStats | null;
};

export type AgentThread = {
  threadId: string;
  userId: string;
  messages: ThreadMessage[];
  updatedAt: number;
  createdAt: number;
  title: string;
};

export type ThreadListItem = {
  threadId: string;
  title: string;
  preview: string;
  messageCount: number;
  updatedAt: string;
  createdAt: string;
};

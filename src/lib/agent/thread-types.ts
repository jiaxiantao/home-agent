export type ThreadMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
  sql?: string;
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

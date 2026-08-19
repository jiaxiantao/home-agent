import { createThreadId } from "@/lib/agent/thread-id";
import type { ThreadMessage } from "@/lib/agent/thread-types";

export { createThreadId };

type PersistThreadPayload = {
  threadId?: string;
  message?: Pick<ThreadMessage, "role" | "content" | "ts" | "sql">;
};

export type PersistThreadResult = {
  threadId: string;
  title: string;
};

export async function persistThreadOnServer(
  payload: PersistThreadPayload,
): Promise<PersistThreadResult | null> {
  try {
    const response = await fetch("/api/agent-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as PersistThreadResult;
  } catch {
    return null;
  }
}

export async function ensureThreadOnServer(threadId: string) {
  return persistThreadOnServer({ threadId });
}

export async function persistUserMessage(threadId: string, content: string) {
  return persistThreadOnServer({
    threadId,
    message: { role: "user", content, ts: Date.now() },
  });
}

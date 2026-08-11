import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";

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
};

const globalThreads = globalThis as typeof globalThis & {
  __homeAgentThreads?: Map<string, AgentThread>;
};

const memoryThreads =
  globalThreads.__homeAgentThreads ?? new Map<string, AgentThread>();

if (!globalThreads.__homeAgentThreads) {
  globalThreads.__homeAgentThreads = memoryThreads;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 20;

const REDIS_PREFIX = `${PRODUCT_SLUG}:thread:`;

function threadKey(threadId: string, userId: string) {
  return `${REDIS_PREFIX}${userId}:${threadId}`;
}

function trimMessages(messages: ThreadMessage[]) {
  return messages.slice(-MAX_MESSAGES);
}

export function createThreadId() {
  return `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readThread(threadId: string, userId: string) {
  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      const raw = await client.get(threadKey(threadId, userId));
      if (raw) {
        return JSON.parse(raw) as AgentThread;
      }
    }
  }

  return memoryThreads.get(threadKey(threadId, userId)) ?? null;
}

async function writeThread(thread: AgentThread) {
  const key = threadKey(thread.threadId, thread.userId);

  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      await client.set(key, JSON.stringify(thread), { PX: TTL_MS });
      return;
    }
  }

  memoryThreads.set(key, thread);
}

export async function getThreadMessages(threadId: string, userId: string) {
  const thread = await readThread(threadId, userId);
  return thread?.messages ?? [];
}

export async function appendThreadMessage(
  threadId: string,
  userId: string,
  message: ThreadMessage,
) {
  const existing =
    (await readThread(threadId, userId)) ??
    ({
      threadId,
      userId,
      messages: [],
      updatedAt: Date.now(),
    } satisfies AgentThread);

  const next: AgentThread = {
    ...existing,
    messages: trimMessages([...existing.messages, message]),
    updatedAt: Date.now(),
  };

  await writeThread(next);
  return next;
}

export async function ensureThread(threadId: string | undefined, userId: string) {
  const resolvedThreadId = threadId?.trim() || createThreadId();
  const existing = await readThread(resolvedThreadId, userId);

  if (!existing) {
    const created: AgentThread = {
      threadId: resolvedThreadId,
      userId,
      messages: [],
      updatedAt: Date.now(),
    };
    await writeThread(created);
    return created;
  }

  return existing;
}

export function formatThreadForPlanner(messages: ThreadMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    sql: message.sql,
  }));
}

/** 测试用 */
export function clearThreadsForTest() {
  memoryThreads.clear();
}

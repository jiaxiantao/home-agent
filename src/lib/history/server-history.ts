import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";

export type ServerHistoryStatus = "awaiting" | "done" | "error" | "cancelled";

export type ServerHistoryEntry = {
  id: string;
  userId: string;
  threadId: string;
  question: string;
  answer?: string;
  sql?: string;
  rowCount?: number;
  createdAt: string;
  updatedAt: string;
  status: ServerHistoryStatus;
  runId?: string;
};

const MAX_PER_USER = 100;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const REDIS_PREFIX = `${PRODUCT_SLUG}:history:`;

const globalStore = globalThis as typeof globalThis & {
  __dfcDataAgentHistory?: Map<string, ServerHistoryEntry[]>;
};

const memoryStore =
  globalStore.__dfcDataAgentHistory ?? new Map<string, ServerHistoryEntry[]>();

if (!globalStore.__dfcDataAgentHistory) {
  globalStore.__dfcDataAgentHistory = memoryStore;
}

function redisKey(userId: string) {
  return `${REDIS_PREFIX}${userId}`;
}

function sortByCreatedDesc(entries: ServerHistoryEntry[]) {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function readUserHistory(userId: string): Promise<ServerHistoryEntry[]> {
  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      const raw = await client.get(redisKey(userId));
      if (raw) {
        return JSON.parse(raw) as ServerHistoryEntry[];
      }
    }
  }

  return memoryStore.get(userId) ?? [];
}

async function writeUserHistory(userId: string, entries: ServerHistoryEntry[]) {
  const trimmed = sortByCreatedDesc(entries).slice(0, MAX_PER_USER);

  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      await client.set(redisKey(userId), JSON.stringify(trimmed), {
        PX: TTL_MS,
      });
      return trimmed;
    }
  }

  memoryStore.set(userId, trimmed);
  return trimmed;
}

export async function listServerHistory(userId: string, limit = 50) {
  const entries = await readUserHistory(userId);
  return sortByCreatedDesc(entries).slice(0, Math.min(Math.max(limit, 1), 100));
}

export async function createServerHistory(input: {
  userId: string;
  threadId: string;
  question: string;
  status: ServerHistoryStatus;
  sql?: string;
  answer?: string;
  rowCount?: number;
  runId?: string;
}) {
  const now = new Date().toISOString();
  const entry: ServerHistoryEntry = {
    id: `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    threadId: input.threadId,
    question: input.question,
    status: input.status,
    sql: input.sql,
    answer: input.answer,
    rowCount: input.rowCount,
    runId: input.runId,
    createdAt: now,
    updatedAt: now,
  };

  const current = await readUserHistory(input.userId);
  await writeUserHistory(input.userId, [entry, ...current]);
  return entry;
}

export async function updateServerHistory(
  userId: string,
  id: string,
  patch: Partial<
    Pick<
      ServerHistoryEntry,
      "status" | "sql" | "answer" | "rowCount" | "runId" | "threadId"
    >
  >,
) {
  const current = await readUserHistory(userId);
  const index = current.findIndex((item) => item.id === id);

  if (index < 0) {
    return null;
  }

  const next = {
    ...current[index]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  current[index] = next;
  await writeUserHistory(userId, current);
  return next;
}

export async function updateServerHistoryByRunId(
  userId: string,
  runId: string,
  patch: Partial<
    Pick<ServerHistoryEntry, "status" | "sql" | "answer" | "rowCount">
  >,
) {
  const current = await readUserHistory(userId);
  const index = current.findIndex((item) => item.runId === runId);

  if (index < 0) {
    return null;
  }

  const next = {
    ...current[index]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  current[index] = next;
  await writeUserHistory(userId, current);
  return next;
}

export async function deleteServerHistory(userId: string, id: string) {
  const current = await readUserHistory(userId);
  const next = current.filter((item) => item.id !== id);

  if (next.length === current.length) {
    return false;
  }

  await writeUserHistory(userId, next);
  return true;
}

/** 测试用 */
export function clearServerHistoryForTest() {
  memoryStore.clear();
}

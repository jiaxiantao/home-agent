import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import {
  executeAppMysql,
  getAppMysqlPool,
  isAppMysqlConfigured,
  queryAppMysql,
} from "@/lib/app-mysql/client";
import { PRODUCT_SLUG } from "@/lib/product";
import type { RowDataPacket } from "mysql2/promise";

import type {
  AgentThread,
  ThreadListItem,
  ThreadMessage,
} from "@/lib/agent/thread-types";

export type { AgentThread, ThreadListItem, ThreadMessage } from "@/lib/agent/thread-types";

const globalThreads = globalThis as typeof globalThis & {
  __dfcDataAgentThreads?: Map<string, AgentThread>;
};

const memoryThreads =
  globalThreads.__dfcDataAgentThreads ?? new Map<string, AgentThread>();

if (!globalThreads.__dfcDataAgentThreads) {
  globalThreads.__dfcDataAgentThreads = memoryThreads;
}

const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 100;
const MAX_THREADS_PER_USER = 200;

const REDIS_PREFIX = `${PRODUCT_SLUG}:thread:`;

type ThreadRow = RowDataPacket & {
  thread_id: string;
  user_id: string;
  messages_json: ThreadMessage[] | string;
  title?: string | null;
  created_at?: Date | null;
  updated_at: Date;
};

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS agent_threads (
  thread_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  messages_json JSON NOT NULL,
  title VARCHAR(120) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, thread_id),
  KEY idx_agent_threads_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

let mysqlEnsured = false;

async function ensureMysqlTable() {
  if (mysqlEnsured || !isAppMysqlConfigured()) {
    return;
  }

  const pool = getAppMysqlPool();
  await pool.query(CREATE_SQL);
  try {
    await pool.query(
      `ALTER TABLE agent_threads ADD COLUMN title VARCHAR(120) NULL`,
    );
  } catch {
    // column may already exist
  }
  try {
    await pool.query(
      `ALTER TABLE agent_threads ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`,
    );
  } catch {
    // column may already exist
  }
  mysqlEnsured = true;
}

function threadKey(threadId: string, userId: string) {
  return `${REDIS_PREFIX}${userId}:${threadId}`;
}

function trimMessages(messages: ThreadMessage[]) {
  return messages.slice(-MAX_MESSAGES);
}

function parseMessages(value: ThreadRow["messages_json"]): ThreadMessage[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as ThreadMessage[];
    } catch {
      return [];
    }
  }
  return [];
}

export function deriveThreadTitle(messages: ThreadMessage[]) {
  const firstUser = messages.find((item) => item.role === "user")?.content?.trim() ?? "";
  return firstUser.slice(0, 40) || "新对话";
}

export function deriveThreadPreview(messages: ThreadMessage[]) {
  const last = [...messages].reverse().find((item) => item.content.trim());
  return (last?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeThread(
  thread: Partial<AgentThread> & {
    threadId: string;
    userId: string;
    messages: ThreadMessage[];
    updatedAt: number;
  },
): AgentThread {
  return {
    threadId: thread.threadId,
    userId: thread.userId,
    messages: thread.messages,
    updatedAt: thread.updatedAt,
    createdAt: thread.createdAt ?? thread.updatedAt,
    title: thread.title?.trim() || deriveThreadTitle(thread.messages),
  };
}

function toListItem(thread: AgentThread): ThreadListItem {
  return {
    threadId: thread.threadId,
    title: thread.title || deriveThreadTitle(thread.messages),
    preview: deriveThreadPreview(thread.messages),
    messageCount: thread.messages.length,
    updatedAt: new Date(thread.updatedAt).toISOString(),
    createdAt: new Date(thread.createdAt).toISOString(),
  };
}

export function createThreadId() {
  return `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapMysqlRow(row: ThreadRow): AgentThread {
  const messages = parseMessages(row.messages_json);
  const updatedAt = new Date(row.updated_at).getTime();
  return normalizeThread({
    threadId: row.thread_id,
    userId: row.user_id,
    messages,
    updatedAt,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : updatedAt,
    title: row.title ?? undefined,
  });
}

async function queryMysqlThreadRows(sqlWithMeta: string, sqlLegacy: string, params: Array<string | number>) {
  try {
    return await queryAppMysql<ThreadRow>(sqlWithMeta, params);
  } catch {
    return await queryAppMysql<ThreadRow>(sqlLegacy, params);
  }
}

async function readThread(threadId: string, userId: string) {
  if (isAppMysqlConfigured()) {
    await ensureMysqlTable();
    const rows = await queryMysqlThreadRows(
      `SELECT thread_id, user_id, messages_json, title, created_at, updated_at
       FROM agent_threads WHERE user_id = ? AND thread_id = ? LIMIT 1`,
      `SELECT thread_id, user_id, messages_json, updated_at
       FROM agent_threads WHERE user_id = ? AND thread_id = ? LIMIT 1`,
      [userId, threadId],
    );
    const row = rows[0];
    return row ? mapMysqlRow(row) : null;
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      const raw = await client.get(threadKey(threadId, userId));
      if (raw) {
        return normalizeThread(JSON.parse(raw) as AgentThread);
      }
    }
  }

  const memory = memoryThreads.get(threadKey(threadId, userId));
  return memory ? normalizeThread(memory) : null;
}

async function writeThread(thread: AgentThread) {
  const next = normalizeThread({
    ...thread,
    messages: trimMessages(thread.messages),
    title: deriveThreadTitle(thread.messages),
    updatedAt: Date.now(),
  });
  const key = threadKey(next.threadId, next.userId);

  if (isAppMysqlConfigured()) {
    await ensureMysqlTable();
    try {
      await executeAppMysql(
        `INSERT INTO agent_threads (thread_id, user_id, messages_json, title, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           messages_json = VALUES(messages_json),
           title = VALUES(title)`,
        [
          next.threadId,
          next.userId,
          JSON.stringify(next.messages),
          next.title,
          new Date(next.createdAt),
        ],
      );
    } catch {
      await executeAppMysql(
        `INSERT INTO agent_threads (thread_id, user_id, messages_json)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE messages_json = VALUES(messages_json)`,
        [next.threadId, next.userId, JSON.stringify(next.messages)],
      );
    }
    memoryThreads.set(key, next);
    return next;
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      await client.set(key, JSON.stringify(next), { PX: TTL_MS });
      memoryThreads.set(key, next);
      return next;
    }
  }

  memoryThreads.set(key, next);
  return next;
}

async function listStoredThreads(userId: string): Promise<AgentThread[]> {
  if (isAppMysqlConfigured()) {
    await ensureMysqlTable();
    const rows = await queryMysqlThreadRows(
      `SELECT thread_id, user_id, messages_json, title, created_at, updated_at
       FROM agent_threads WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT ?`,
      `SELECT thread_id, user_id, messages_json, updated_at
       FROM agent_threads WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT ?`,
      [userId, MAX_THREADS_PER_USER],
    );
    return rows.map(mapMysqlRow);
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      const keys = await client.keys(`${REDIS_PREFIX}${userId}:*`);
      const threads: AgentThread[] = [];
      for (const key of keys) {
        const raw = await client.get(key);
        if (!raw) {
          continue;
        }
        threads.push(normalizeThread(JSON.parse(raw) as AgentThread));
      }
      return threads.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  }

  return [...memoryThreads.values()]
    .filter((item) => item.userId === userId)
    .map((item) => normalizeThread(item))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getThreadMessages(threadId: string, userId: string) {
  const thread = await readThread(threadId, userId);
  return thread?.messages ?? [];
}

export async function getUserThread(threadId: string, userId: string) {
  return readThread(threadId, userId);
}

export async function listUserThreadsPage(input: {
  userId: string;
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  const all = (await listStoredThreads(input.userId)).filter((thread) =>
    thread.messages.some((item) => item.role === "user" && item.content.trim()),
  );
  const query = input.q?.trim().toLowerCase() ?? "";
  const filtered = query
    ? all.filter((thread) => {
        const haystack = [
          thread.title,
          thread.threadId,
          ...thread.messages.map((item) => item.content),
        ]
          .join("\n")
          .toLowerCase();
        return haystack.includes(query);
      })
    : all;

  const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(input.page ?? 1, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize).map(toListItem),
    total: filtered.length,
    page,
    pageSize,
  };
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
      createdAt: Date.now(),
      title: "新对话",
    } satisfies AgentThread);

  return writeThread({
    ...existing,
    messages: [...existing.messages, message],
  });
}

export async function ensureThread(threadId: string | undefined, userId: string) {
  const resolvedThreadId = threadId?.trim() || createThreadId();
  const existing = await readThread(resolvedThreadId, userId);

  if (!existing) {
    return writeThread({
      threadId: resolvedThreadId,
      userId,
      messages: [],
      updatedAt: Date.now(),
      createdAt: Date.now(),
      title: "新对话",
    });
  }

  return existing;
}

export async function deleteUserThread(threadId: string, userId: string) {
  const existing = await readThread(threadId, userId);
  if (!existing) {
    return false;
  }

  if (isAppMysqlConfigured()) {
    await ensureMysqlTable();
    const result = await executeAppMysql(
      `DELETE FROM agent_threads WHERE user_id = ? AND thread_id = ?`,
      [userId, threadId],
    );
    memoryThreads.delete(threadKey(threadId, userId));
    return result.affectedRows > 0;
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      await client.del(threadKey(threadId, userId));
    }
  }

  return memoryThreads.delete(threadKey(threadId, userId)) || Boolean(existing);
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
  mysqlEnsured = false;
}

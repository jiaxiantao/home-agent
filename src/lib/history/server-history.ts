import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { executeAppMysql, isAppMysqlConfigured, queryAppMysql } from "@/lib/app-mysql/client";
import { PRODUCT_SLUG } from "@/lib/product";
import type { RowDataPacket } from "mysql2/promise";

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

/** 列表接口默认返回条数；写入不做截断（MySQL） */
const DEFAULT_LIST_LIMIT = 50;
/** Redis/内存回退时的安全上限，避免进程内存无限增长 */
const MAX_STORED_PER_USER_FALLBACK = 5000;
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

type HistoryRow = RowDataPacket & {
  id: string;
  user_id: string;
  thread_id: string;
  question: string;
  answer: string | null;
  sql_text: string | null;
  row_count: number | null;
  status: ServerHistoryStatus;
  run_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function redisKey(userId: string) {
  return `${REDIS_PREFIX}${userId}`;
}

function sortByCreatedDesc(entries: ServerHistoryEntry[]) {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mapRow(row: HistoryRow): ServerHistoryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id,
    question: row.question,
    answer: row.answer ?? undefined,
    sql: row.sql_text ?? undefined,
    rowCount: row.row_count ?? undefined,
    status: row.status,
    runId: row.run_id ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function readUserHistory(userId: string): Promise<ServerHistoryEntry[]> {
  if (isAppMysqlConfigured()) {
    const rows = await queryAppMysql<HistoryRow>(
      `SELECT id, user_id, thread_id, question, answer, sql_text, row_count, status, run_id, created_at, updated_at
       FROM query_history WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(mapRow);
  }

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
  const sorted = sortByCreatedDesc(entries);
  const stored =
    isAppMysqlConfigured() || sorted.length <= MAX_STORED_PER_USER_FALLBACK
      ? sorted
      : sorted.slice(0, MAX_STORED_PER_USER_FALLBACK);

  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      await client.set(redisKey(userId), JSON.stringify(stored), {
        PX: TTL_MS,
      });
      return stored;
    }
  }

  memoryStore.set(userId, stored);
  return stored;
}

export async function listServerHistory(userId: string, limit = DEFAULT_LIST_LIMIT) {
  const entries = await readUserHistory(userId);
  return sortByCreatedDesc(entries).slice(0, Math.min(Math.max(limit, 1), 500));
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

  if (isAppMysqlConfigured()) {
    await executeAppMysql(
      `INSERT INTO query_history
        (id, user_id, thread_id, question, answer, sql_text, row_count, status, run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.userId,
        entry.threadId,
        entry.question,
        entry.answer ?? null,
        entry.sql ?? null,
        entry.rowCount ?? null,
        entry.status,
        entry.runId ?? null,
      ],
    );
    return entry;
  }

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
  if (isAppMysqlConfigured()) {
    const current = await queryAppMysql<HistoryRow>(
      `SELECT id, user_id, thread_id, question, answer, sql_text, row_count, status, run_id, created_at, updated_at
       FROM query_history WHERE user_id = ? AND id = ? LIMIT 1`,
      [userId, id],
    );
    if (!current[0]) {
      return null;
    }

    const next = {
      ...mapRow(current[0]),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await executeAppMysql(
      `UPDATE query_history
       SET status = ?, sql_text = ?, answer = ?, row_count = ?, run_id = ?, thread_id = ?
       WHERE user_id = ? AND id = ?`,
      [
        next.status,
        next.sql ?? null,
        next.answer ?? null,
        next.rowCount ?? null,
        next.runId ?? null,
        next.threadId,
        userId,
        id,
      ],
    );
    return next;
  }

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
  if (isAppMysqlConfigured()) {
    const current = await queryAppMysql<HistoryRow>(
      `SELECT id, user_id, thread_id, question, answer, sql_text, row_count, status, run_id, created_at, updated_at
       FROM query_history WHERE user_id = ? AND run_id = ? LIMIT 1`,
      [userId, runId],
    );
    if (!current[0]) {
      return null;
    }
    return updateServerHistory(userId, current[0].id, patch);
  }

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
  if (isAppMysqlConfigured()) {
    const result = await executeAppMysql(
      `DELETE FROM query_history WHERE user_id = ? AND id = ?`,
      [userId, id],
    );
    return result.affectedRows > 0;
  }

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

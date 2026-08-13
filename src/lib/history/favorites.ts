import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { executeAppMysql, isAppMysqlConfigured, queryAppMysql } from "@/lib/app-mysql/client";
import { PRODUCT_SLUG } from "@/lib/product";
import type { RowDataPacket } from "mysql2/promise";

export type FavoritePrompt = {
  id: string;
  userId: string;
  label: string;
  prompt: string;
  createdAt: string;
};

const MAX_PER_USER = 40;
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

const REDIS_PREFIX = `${PRODUCT_SLUG}:favorites:`;

const globalStore = globalThis as typeof globalThis & {
  __dfcDataAgentFavorites?: Map<string, FavoritePrompt[]>;
};

const memoryStore =
  globalStore.__dfcDataAgentFavorites ?? new Map<string, FavoritePrompt[]>();

if (!globalStore.__dfcDataAgentFavorites) {
  globalStore.__dfcDataAgentFavorites = memoryStore;
}

type FavoriteRow = RowDataPacket & {
  id: string;
  user_id: string;
  label: string;
  prompt: string;
  created_at: Date;
};

function redisKey(userId: string) {
  return `${REDIS_PREFIX}${userId}`;
}

function mapRow(row: FavoriteRow): FavoritePrompt {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    prompt: row.prompt,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function readFavorites(userId: string): Promise<FavoritePrompt[]> {
  if (isAppMysqlConfigured()) {
    const rows = await queryAppMysql<FavoriteRow>(
      `SELECT id, user_id, label, prompt, created_at
       FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, MAX_PER_USER],
    );
    return rows.map(mapRow);
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      const raw = await client.get(redisKey(userId));
      if (raw) {
        return JSON.parse(raw) as FavoritePrompt[];
      }
    }
  }

  return memoryStore.get(userId) ?? [];
}

async function writeFavorites(userId: string, entries: FavoritePrompt[]) {
  const trimmed = entries.slice(0, MAX_PER_USER);

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

export async function listFavorites(userId: string) {
  const entries = await readFavorites(userId);
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type FavoriteListQuery = {
  page?: number;
  pageSize?: number;
};

export type FavoriteListResult = {
  items: FavoritePrompt[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listFavoritesPage(
  userId: string,
  options: FavoriteListQuery = {},
): Promise<FavoriteListResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 10));
  const all = await listFavorites(userId);
  const total = all.length;
  const start = (page - 1) * pageSize;

  return {
    items: all.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}

export async function createFavorite(input: {
  userId: string;
  label: string;
  prompt: string;
}) {
  const label = input.label.trim().slice(0, 40);
  const prompt = input.prompt.trim().slice(0, 2000);

  if (!label || !prompt) {
    throw new Error("label 与 prompt 不能为空");
  }

  if (isAppMysqlConfigured()) {
    const existing = await queryAppMysql<FavoriteRow>(
      `SELECT id, user_id, label, prompt, created_at
       FROM favorites WHERE user_id = ? AND prompt = ? LIMIT 1`,
      [input.userId, prompt],
    );
    if (existing[0]) {
      return mapRow(existing[0]);
    }

    const id = `fav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await executeAppMysql(
      `INSERT INTO favorites (id, user_id, label, prompt) VALUES (?, ?, ?, ?)`,
      [id, input.userId, label, prompt],
    );
    const created = await queryAppMysql<FavoriteRow>(
      `SELECT id, user_id, label, prompt, created_at FROM favorites WHERE id = ? LIMIT 1`,
      [id],
    );
    return mapRow(created[0]!);
  }

  const current = await readFavorites(input.userId);
  const duplicate = current.find((item) => item.prompt === prompt);

  if (duplicate) {
    return duplicate;
  }

  const entry: FavoritePrompt = {
    id: `fav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    label,
    prompt,
    createdAt: new Date().toISOString(),
  };

  await writeFavorites(input.userId, [entry, ...current]);
  return entry;
}

export async function deleteFavorite(userId: string, id: string) {
  if (isAppMysqlConfigured()) {
    const result = await executeAppMysql(
      `DELETE FROM favorites WHERE user_id = ? AND id = ?`,
      [userId, id],
    );
    return result.affectedRows > 0;
  }

  const current = await readFavorites(userId);
  const next = current.filter((item) => item.id !== id);

  if (next.length === current.length) {
    return false;
  }

  await writeFavorites(userId, next);
  return true;
}

/** 测试用 */
export function clearFavoritesForTest() {
  memoryStore.clear();
}

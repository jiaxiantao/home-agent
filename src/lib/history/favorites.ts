import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";

export type FavoritePrompt = {
  id: string;
  userId: string;
  label: string;
  prompt: string;
  createdAt: string;
};

const MAX_PER_USER = 40;
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const REDIS_PREFIX = "home-agent:favorites:";

const globalStore = globalThis as typeof globalThis & {
  __homeAgentFavorites?: Map<string, FavoritePrompt[]>;
};

const memoryStore =
  globalStore.__homeAgentFavorites ?? new Map<string, FavoritePrompt[]>();

if (!globalStore.__homeAgentFavorites) {
  globalStore.__homeAgentFavorites = memoryStore;
}

function redisKey(userId: string) {
  return `${REDIS_PREFIX}${userId}`;
}

async function readFavorites(userId: string): Promise<FavoritePrompt[]> {
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

import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import type { AuthUser } from "@/lib/security/auth-config";
import type { AgentToolResult } from "@/lib/agent/types";
import { PRODUCT_SLUG } from "@/lib/product";

export type PendingSqlRun = {
  runId: string;
  message: string;
  prior: AgentToolResult[];
  sql: string;
  explanation: string;
  createdAt: number;
  mock?: boolean;
  userId?: string;
  userName?: string;
  clientIp?: string;
  threadId?: string;
};

const globalForPending = globalThis as typeof globalThis & {
  __homeAgentPendingSqlRuns?: Map<string, PendingSqlRun>;
};

const pendingRuns =
  globalForPending.__homeAgentPendingSqlRuns ??
  new Map<string, PendingSqlRun>();

if (!globalForPending.__homeAgentPendingSqlRuns) {
  globalForPending.__homeAgentPendingSqlRuns = pendingRuns;
}

const TTL_MS = 30 * 60 * 1000;

const REDIS_KEY_PREFIX = `${PRODUCT_SLUG}:pending-sql:`;

function redisKey(runId: string) {
  return `${REDIS_KEY_PREFIX}${runId}`;
}

function pruneExpiredMemory() {
  const now = Date.now();

  for (const [runId, run] of pendingRuns) {
    if (now - run.createdAt > TTL_MS) {
      pendingRuns.delete(runId);
    }
  }
}

function isFresh(run: PendingSqlRun | null | undefined): run is PendingSqlRun {
  return run != null && Date.now() - run.createdAt <= TTL_MS;
}

async function readFromRedis(runId: string) {
  try {
    const client = await getRedisClient();
    if (!client) {
      return null;
    }
    const raw = await client.get(redisKey(runId));
    return raw ? (JSON.parse(raw) as PendingSqlRun) : null;
  } catch {
    return null;
  }
}

async function writeToRedis(run: PendingSqlRun) {
  const client = await getRedisClient();
  if (!client) {
    return false;
  }
  await client.set(redisKey(run.runId), JSON.stringify(run), {
    PX: TTL_MS,
  });
  return true;
}

async function deleteFromRedis(runId: string) {
  try {
    const client = await getRedisClient();
    if (!client) {
      return false;
    }
    await client.del(redisKey(runId));
    return true;
  } catch {
    return false;
  }
}

export async function savePendingSqlRun(run: PendingSqlRun) {
  pruneExpiredMemory();
  pendingRuns.set(run.runId, run);

  if (!isRedisConfigured()) {
    return;
  }

  try {
    await writeToRedis(run);
  } catch {
    // keep memory copy so confirm still works on this worker
  }
}

export async function getPendingSqlRun(runId: string) {
  pruneExpiredMemory();

  if (isRedisConfigured()) {
    const redisRun = await readFromRedis(runId);
    if (isFresh(redisRun)) {
      pendingRuns.set(runId, redisRun);
      return redisRun;
    }
  }

  const memoryRun = pendingRuns.get(runId) ?? null;
  return isFresh(memoryRun) ? memoryRun : null;
}

export async function takePendingSqlRun(runId: string) {
  const run = await getPendingSqlRun(runId);
  if (!run) {
    return null;
  }

  pendingRuns.delete(runId);
  if (isRedisConfigured()) {
    await deleteFromRedis(runId);
  }
  return run;
}

export function createRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function attachUserToPendingRun(
  run: PendingSqlRun,
  user: AuthUser,
  clientIp?: string,
  threadId?: string,
): PendingSqlRun {
  return {
    ...run,
    userId: user.userId,
    userName: user.userName,
    clientIp,
    threadId,
  };
}

/** 测试用 */
export function clearPendingSqlRunsForTest() {
  pendingRuns.clear();
}

export function pendingSqlRunCountForTest() {
  return pendingRuns.size;
}

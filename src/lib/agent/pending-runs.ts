import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import type { AuthUser } from "@/lib/security/auth-config";
import type { AgentToolResult } from "@/lib/agent/types";

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
const REDIS_KEY_PREFIX = "home-agent:pending-sql:";

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

async function readFromRedis(runId: string) {
  const client = await getRedisClient();

  if (!client) {
    return null;
  }

  const raw = await client.get(redisKey(runId));
  return raw ? (JSON.parse(raw) as PendingSqlRun) : null;
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
  const client = await getRedisClient();

  if (!client) {
    return false;
  }

  await client.del(redisKey(runId));
  return true;
}

export async function savePendingSqlRun(run: PendingSqlRun) {
  pruneExpiredMemory();

  if (isRedisConfigured()) {
    const saved = await writeToRedis(run);

    if (saved) {
      return;
    }
  }

  pendingRuns.set(run.runId, run);
}

export async function getPendingSqlRun(runId: string) {
  pruneExpiredMemory();

  if (isRedisConfigured()) {
    const run = await readFromRedis(runId);

    if (run) {
      return run;
    }
  }

  return pendingRuns.get(runId) ?? null;
}

export async function takePendingSqlRun(runId: string) {
  pruneExpiredMemory();

  if (isRedisConfigured()) {
    const run = await readFromRedis(runId);

    if (run) {
      await deleteFromRedis(runId);
      return run;
    }
  }

  const run = pendingRuns.get(runId) ?? null;

  if (run) {
    pendingRuns.delete(runId);
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

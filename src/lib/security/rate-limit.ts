import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";

type Bucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, Bucket>();

function getRateLimitPerMinute() {
  const parsed = Number(process.env.RATE_LIMIT_AGENT_PER_MIN ?? "30");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 30;
}

function bucketKey(scope: string, subject: string) {
  return `rate:agent:${scope}:${subject}`;
}

async function consumeRedis(key: string, limit: number) {
  const client = await getRedisClient();

  if (!client) {
    return null;
  }

  const count = await client.incr(key);

  if (count === 1) {
    await client.expire(key, 60);
  }

  return count <= limit;
}

function consumeMemory(key: string, limit: number) {
  const now = Date.now();
  const current = memoryBuckets.get(key);

  if (!current || now >= current.resetAt) {
    memoryBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  current.count += 1;
  return current.count <= limit;
}

export async function checkAgentRateLimit(subject: string) {
  const limit = getRateLimitPerMinute();
  const key = bucketKey("agent", subject);

  if (isRedisConfigured()) {
    const allowed = await consumeRedis(key, limit);

    if (allowed != null) {
      return { allowed, limit };
    }
  }

  return { allowed: consumeMemory(key, limit), limit };
}

/** 测试用 */
export function resetRateLimitForTest() {
  memoryBuckets.clear();
}

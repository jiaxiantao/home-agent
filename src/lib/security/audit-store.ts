import type { AuditRecord } from "@/lib/security/audit-log";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";

const MAX_ENTRIES = 500;
const REDIS_KEY = "home-agent:audit:events";
const TTL_SECONDS = 14 * 24 * 60 * 60;

const globalStore = globalThis as typeof globalThis & {
  __homeAgentAuditBuffer?: AuditRecord[];
};

const memoryBuffer =
  globalStore.__homeAgentAuditBuffer ?? ([] as AuditRecord[]);

if (!globalStore.__homeAgentAuditBuffer) {
  globalStore.__homeAgentAuditBuffer = memoryBuffer;
}

async function postAuditHttpSink(record: AuditRecord) {
  const url = process.env.AUDIT_HTTP_URL?.trim();

  if (!url) {
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = process.env.AUDIT_HTTP_TOKEN?.trim();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ audit: record }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      console.error(`[audit] http sink HTTP ${response.status}`);
    }
  } catch (error) {
    console.error("[audit] http sink failed:", error);
  }
}

export async function persistAudit(record: AuditRecord) {
  memoryBuffer.unshift(record);

  if (memoryBuffer.length > MAX_ENTRIES) {
    memoryBuffer.length = MAX_ENTRIES;
  }

  void postAuditHttpSink(record);

  if (!isRedisConfigured()) {
    return;
  }

  const client = await getRedisClient();

  if (!client) {
    return;
  }

  try {
    await client.lPush(REDIS_KEY, JSON.stringify(record));
    await client.lTrim(REDIS_KEY, 0, MAX_ENTRIES - 1);
    await client.expire(REDIS_KEY, TTL_SECONDS);
  } catch (error) {
    console.error("[audit] redis persist failed:", error);
  }
}

export async function listAuditRecords(options?: {
  limit?: number;
  userId?: string;
  event?: string;
}) {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  let records: AuditRecord[] = [];

  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      try {
        const raw = await client.lRange(REDIS_KEY, 0, limit * 2 - 1);
        records = raw.map((item) => JSON.parse(item) as AuditRecord);
      } catch {
        records = [...memoryBuffer];
      }
    } else {
      records = [...memoryBuffer];
    }
  } else {
    records = [...memoryBuffer];
  }

  if (options?.userId) {
    records = records.filter((item) => item.userId === options.userId);
  }

  if (options?.event) {
    records = records.filter((item) => item.event === options.event);
  }

  return records.slice(0, limit);
}

/** 测试用 */
export function clearAuditBufferForTest() {
  memoryBuffer.length = 0;
}

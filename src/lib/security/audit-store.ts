import type { AuditRecord } from "@/lib/security/audit-log";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { executeAppMysql, isAppMysqlConfigured, queryAppMysql } from "@/lib/app-mysql/client";
import { PRODUCT_SLUG } from "@/lib/product";
import type { RowDataPacket } from "mysql2/promise";

const MAX_ENTRIES = 500;

const REDIS_KEY = `${PRODUCT_SLUG}:audit:events`;
const TTL_SECONDS = 14 * 24 * 60 * 60;

const globalStore = globalThis as typeof globalThis & {
  __dfcDataAgentAuditBuffer?: AuditRecord[];
};

const memoryBuffer =
  globalStore.__dfcDataAgentAuditBuffer ?? ([] as AuditRecord[]);

if (!globalStore.__dfcDataAgentAuditBuffer) {
  globalStore.__dfcDataAgentAuditBuffer = memoryBuffer;
}

type AuditRow = RowDataPacket & {
  payload_json: AuditRecord | string;
};

function parseRecord(value: AuditRow["payload_json"]): AuditRecord {
  if (typeof value === "string") {
    return JSON.parse(value) as AuditRecord;
  }
  return value;
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

  if (isAppMysqlConfigured()) {
    try {
      await executeAppMysql(
        `INSERT INTO audit_events (event, user_id, payload_json) VALUES (?, ?, ?)`,
        [record.event, record.userId ?? null, JSON.stringify(record)],
      );
      const countRows = await queryAppMysql<RowDataPacket & { n: number }>(
        `SELECT COUNT(*) AS n FROM audit_events`,
      );
      const extra = Number(countRows[0]?.n ?? 0) - MAX_ENTRIES;
      if (extra > 0) {
        await executeAppMysql(
          `DELETE FROM audit_events ORDER BY id ASC LIMIT ?`,
          [extra],
        );
      }
    } catch (error) {
      console.error("[audit] mysql persist failed:", error);
    }
    return;
  }

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

  if (isAppMysqlConfigured()) {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options?.userId) {
      clauses.push("user_id = ?");
      params.push(options.userId);
    }
    if (options?.event) {
      clauses.push("event = ?");
      params.push(options.event);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await queryAppMysql<AuditRow>(
      `SELECT payload_json FROM audit_events ${where} ORDER BY id DESC LIMIT ?`,
      [...params, limit],
    );
    return rows.map((row) => parseRecord(row.payload_json));
  }

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

import { executeAppMysql, isAppMysqlConfigured, queryAppMysql } from "@/lib/app-mysql/client";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";
import type { RowDataPacket } from "mysql2/promise";

export type TemplateUsage = {
  useCount: number;
  lastUsedAt: string | null;
};

const REDIS_KEY = `${PRODUCT_SLUG}:team-template-usage`;
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

const globalStore = globalThis as typeof globalThis & {
  __dfcDataAgentTeamTemplateUsage?: Map<string, TemplateUsage>;
};

function getMemoryMap() {
  if (!globalStore.__dfcDataAgentTeamTemplateUsage) {
    globalStore.__dfcDataAgentTeamTemplateUsage = new Map();
  }
  return globalStore.__dfcDataAgentTeamTemplateUsage;
}

type UsageRow = RowDataPacket & {
  template_id: string;
  use_count: number;
  last_used_at: Date | null;
};

function mapRow(row: UsageRow): [string, TemplateUsage] {
  return [
    row.template_id,
    {
      useCount: row.use_count,
      lastUsedAt: row.last_used_at
        ? new Date(row.last_used_at).toISOString()
        : null,
    },
  ];
}

async function readRedisUsage(): Promise<Map<string, TemplateUsage>> {
  const map = new Map<string, TemplateUsage>();
  if (!isRedisConfigured()) {
    return map;
  }

  const client = await getRedisClient();
  if (!client) {
    return map;
  }

  const raw = await client.get(REDIS_KEY);
  if (!raw) {
    return map;
  }

  const parsed = JSON.parse(raw) as Record<string, TemplateUsage>;
  for (const [id, usage] of Object.entries(parsed)) {
    map.set(id, {
      useCount: usage.useCount ?? 0,
      lastUsedAt: usage.lastUsedAt ?? null,
    });
  }
  return map;
}

async function writeRedisUsage(map: Map<string, TemplateUsage>) {
  if (!isRedisConfigured()) {
    return;
  }

  const client = await getRedisClient();
  if (!client) {
    return;
  }

  const payload = Object.fromEntries(map.entries());
  await client.set(REDIS_KEY, JSON.stringify(payload), { PX: TTL_MS });
}

export async function getTeamTemplateUsageMap() {
  if (isAppMysqlConfigured()) {
    const rows = await queryAppMysql<UsageRow>(
      `SELECT template_id, use_count, last_used_at FROM team_template_usage`,
    );
    return new Map(rows.map(mapRow));
  }

  if (isRedisConfigured()) {
    return readRedisUsage();
  }

  return new Map(getMemoryMap());
}

export async function recordTeamTemplateUse(templateId: string) {
  const id = templateId.trim();
  if (!id) {
    return;
  }

  if (isAppMysqlConfigured()) {
    await executeAppMysql(
      `INSERT INTO team_template_usage (template_id, use_count, last_used_at)
       VALUES (?, 1, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         use_count = use_count + 1,
         last_used_at = CURRENT_TIMESTAMP(3)`,
      [id],
    );
    return;
  }

  const map = isRedisConfigured()
    ? await readRedisUsage()
    : getMemoryMap();
  const current = map.get(id) ?? { useCount: 0, lastUsedAt: null };
  map.set(id, {
    useCount: current.useCount + 1,
    lastUsedAt: new Date().toISOString(),
  });

  if (isRedisConfigured()) {
    await writeRedisUsage(map);
  }
}

/** 测试用 */
export function clearTeamTemplateUsageForTest() {
  globalStore.__dfcDataAgentTeamTemplateUsage = new Map();
}

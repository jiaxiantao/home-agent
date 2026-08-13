import {
  executeAppMysql,
  getAppMysqlPool,
  isAppMysqlConfigured,
  queryAppMysql,
} from "@/lib/app-mysql/client";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";
import type { RowDataPacket } from "mysql2/promise";

const REDIS_PREFIX = `${PRODUCT_SLUG}:template-favorites:`;
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS team_template_favorites (
  user_id VARCHAR(64) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, template_id),
  KEY idx_team_template_favorites_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const globalStore = globalThis as typeof globalThis & {
  __dfcDataAgentTemplateFavorites?: Map<string, string[]>;
};

let mysqlEnsured = false;

function getMemoryMap() {
  if (!globalStore.__dfcDataAgentTemplateFavorites) {
    globalStore.__dfcDataAgentTemplateFavorites = new Map();
  }
  return globalStore.__dfcDataAgentTemplateFavorites;
}

async function ensureFavoritesTable() {
  if (mysqlEnsured || !isAppMysqlConfigured()) {
    return;
  }
  await getAppMysqlPool().query(CREATE_SQL);
  mysqlEnsured = true;
}

type FavoriteRow = RowDataPacket & {
  template_id: string;
};

async function writeFavoriteIds(userId: string, ids: string[]) {
  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      await client.set(`${REDIS_PREFIX}${userId}`, JSON.stringify(ids), {
        PX: TTL_MS,
      });
    }
  }
  getMemoryMap().set(userId, ids);
}

export async function listFavoriteTemplateIds(userId: string) {
  const trimmed = userId.trim();
  if (!trimmed) {
    return [];
  }

  if (isAppMysqlConfigured()) {
    await ensureFavoritesTable();
    const rows = await queryAppMysql<FavoriteRow>(
      `SELECT template_id FROM team_template_favorites
       WHERE user_id = ? ORDER BY created_at DESC`,
      [trimmed],
    );
    return rows.map((row) => row.template_id);
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      const raw = await client.get(`${REDIS_PREFIX}${trimmed}`);
      if (raw) {
        return JSON.parse(raw) as string[];
      }
    }
  }

  return [...(getMemoryMap().get(trimmed) ?? [])];
}

export async function toggleFavoriteTemplate(userId: string, templateId: string) {
  const trimmedUserId = userId.trim();
  const trimmedTemplateId = templateId.trim();
  if (!trimmedUserId || !trimmedTemplateId) {
    throw new Error("缺少收藏参数");
  }

  if (isAppMysqlConfigured()) {
    await ensureFavoritesTable();
    const existing = await queryAppMysql<FavoriteRow>(
      `SELECT template_id FROM team_template_favorites
       WHERE user_id = ? AND template_id = ? LIMIT 1`,
      [trimmedUserId, trimmedTemplateId],
    );
    if (existing[0]) {
      await executeAppMysql(
        `DELETE FROM team_template_favorites WHERE user_id = ? AND template_id = ?`,
        [trimmedUserId, trimmedTemplateId],
      );
      return false;
    }

    await executeAppMysql(
      `INSERT INTO team_template_favorites (user_id, template_id) VALUES (?, ?)`,
      [trimmedUserId, trimmedTemplateId],
    );
    return true;
  }

  const current = await listFavoriteTemplateIds(trimmedUserId);
  if (current.includes(trimmedTemplateId)) {
    await writeFavoriteIds(
      trimmedUserId,
      current.filter((id) => id !== trimmedTemplateId),
    );
    return false;
  }

  await writeFavoriteIds(trimmedUserId, [trimmedTemplateId, ...current]);
  return true;
}

export async function removeFavoriteLinksForTemplate(templateId: string) {
  const trimmed = templateId.trim();
  if (!trimmed) {
    return;
  }

  if (isAppMysqlConfigured()) {
    await ensureFavoritesTable();
    await executeAppMysql(
      `DELETE FROM team_template_favorites WHERE template_id = ?`,
      [trimmed],
    );
    return;
  }

  const map = getMemoryMap();
  for (const [userId, ids] of map.entries()) {
    const next = ids.filter((id) => id !== trimmed);
    if (next.length !== ids.length) {
      await writeFavoriteIds(userId, next);
    }
  }
}

export function clearFavoriteTemplatesForTest() {
  globalStore.__dfcDataAgentTemplateFavorites = undefined;
  mysqlEnsured = false;
}

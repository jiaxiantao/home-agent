import { agentToolCatalog } from "@/lib/agent/tool-catalog";
import { executeAppMysql, getAppMysqlPool, queryAppMysql } from "@/lib/app-mysql/client";
import type { RowDataPacket } from "mysql2/promise";

import type { ManagedAgentTool, ManagedHttpConfig } from "@/lib/agent/managed-tools";

type AgentToolRow = RowDataPacket & {
  id: string;
  name: string;
  label: string;
  description: string;
  args_json: Record<string, string> | string;
  enabled: number | boolean;
  kind: string;
  http_json: ManagedHttpConfig | string | null;
  builtin: number | boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS agent_tools (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  label VARCHAR(80) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  args_json JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  kind VARCHAR(16) NOT NULL,
  http_json JSON NULL,
  builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(64) NOT NULL DEFAULT 'system',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_agent_tools_name (name),
  KEY idx_agent_tools_kind (kind, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

let ensured = false;
let seeded = false;

async function ensureTable() {
  if (ensured) {
    return;
  }
  await getAppMysqlPool().query(CREATE_SQL);
  ensured = true;
}

export async function seedBuiltinToolsIfMissing() {
  await ensureTable();
  if (seeded) {
    return;
  }

  const rows = await queryAppMysql<RowDataPacket & { name: string }>(
    `SELECT name FROM agent_tools WHERE builtin = 1`,
  );
  const existing = new Set(rows.map((row) => row.name));
  const createdAt = "1970-01-01T00:00:00.000Z";
  const updatedAt = createdAt;

  for (const item of agentToolCatalog) {
    if (existing.has(item.name)) {
      continue;
    }

    const tool: ManagedAgentTool = {
      id: item.name,
      name: item.name,
      label: item.label,
      description: item.description,
      args: { ...item.args },
      enabled: true,
      kind: "builtin",
      builtin: true,
      createdAt,
      updatedAt,
      createdBy: "system",
    };
    await upsertMysqlManagedTool(tool);
  }

  seeded = true;
}

export async function ensureAgentToolsTableAndSeed() {
  await seedBuiltinToolsIfMissing();
}

function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value == null) {
    return fallback;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value;
}

function mapRow(row: AgentToolRow): ManagedAgentTool {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    description: row.description,
    args: parseJson<Record<string, string>>(row.args_json, {}),
    enabled: Boolean(row.enabled),
    kind: row.kind === "http" ? "http" : "builtin",
    http: parseJson<ManagedHttpConfig | null>(row.http_json, null) ?? undefined,
    builtin: Boolean(row.builtin),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by,
  };
}

export async function listMysqlManagedTools() {
  await ensureTable();
  const rows = await queryAppMysql<AgentToolRow>(
    `SELECT id, name, label, description, args_json, enabled, kind, http_json,
            builtin, created_by, created_at, updated_at
     FROM agent_tools
     ORDER BY builtin DESC, name ASC`,
  );
  return rows.map(mapRow);
}

export async function upsertMysqlManagedTool(tool: ManagedAgentTool) {
  await ensureTable();
  await executeAppMysql(
    `INSERT INTO agent_tools
       (id, name, label, description, args_json, enabled, kind, http_json, builtin, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       label = VALUES(label),
       description = VALUES(description),
       args_json = VALUES(args_json),
       enabled = VALUES(enabled),
       kind = VALUES(kind),
       http_json = VALUES(http_json),
       builtin = VALUES(builtin),
       updated_at = VALUES(updated_at)`,
    [
      tool.id,
      tool.name,
      tool.label,
      tool.description,
      JSON.stringify(tool.args ?? {}),
      tool.enabled ? 1 : 0,
      tool.kind,
      tool.http ? JSON.stringify(tool.http) : null,
      tool.builtin ? 1 : 0,
      tool.createdBy ?? "system",
      new Date(tool.createdAt),
      new Date(tool.updatedAt),
    ],
  );
  return tool;
}

export async function deleteMysqlManagedTool(id: string) {
  await ensureTable();
  const result = await executeAppMysql(
    `DELETE FROM agent_tools WHERE id = ? AND builtin = 0`,
    [id],
  );
  return result.affectedRows > 0;
}

export function resetMysqlManagedToolsEnsure() {
  ensured = false;
  seeded = false;
}

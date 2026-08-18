import { executeAppMysql, getAppMysqlPool, queryAppMysql } from "@/lib/app-mysql/client";
import { inferDefaultTestParams } from "@/lib/analytics/dfc-api-default-params";
import {
  inferDefaultTestConfig,
  mergeTestConfig,
  parseStoredTestConfig,
  type DfcApiTestConfig,
} from "@/lib/analytics/dfc-api-test-config";
import {
  parseDefaultTestParams,
  parseStoredEndpointJson,
  serializeDfcApiEndpoint,
  type StoredDfcApiEndpoint,
} from "@/lib/analytics/dfc-api-endpoint-serialize";
import type { ApiRouteParams, DfcApiEndpoint } from "@/lib/analytics/api-catalog-types";
import { DFC_API_LIST_ORDER_BY_SQL } from "@/lib/analytics/dfc-api-endpoint-sort";
import type { RowDataPacket } from "mysql2/promise";

type SqlParam = string | number | boolean | Date | Buffer | null;

type DfcApiEndpointRow = RowDataPacket & {
  id: string;
  app_code: string;
  kind: string;
  title: string;
  description: string | null;
  read_only: number | boolean;
  base_url_env_key: string;
  endpoint_json: unknown;
  default_test_params_json: unknown;
  default_test_config_json?: unknown;
  seeded: number | boolean;
  enabled: number | boolean;
  agent_call_count: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS dfc_api_endpoints (
  id VARCHAR(512) NOT NULL,
  app_code VARCHAR(64) NOT NULL,
  kind VARCHAR(8) NOT NULL,
  title VARCHAR(256) NOT NULL,
  description TEXT NULL,
  read_only TINYINT(1) NOT NULL DEFAULT 1,
  base_url_env_key VARCHAR(128) NOT NULL DEFAULT 'DFC_API_GATEWAY_BASE_URL',
  endpoint_json JSON NOT NULL,
  default_test_params_json JSON NULL,
  default_test_config_json JSON NULL,
  seeded TINYINT(1) NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  agent_call_count INT NOT NULL DEFAULT 0,
  created_by VARCHAR(64) NOT NULL DEFAULT 'system',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_dfc_api_app_kind (app_code, kind),
  KEY idx_dfc_api_kind_enabled (kind, enabled),
  KEY idx_dfc_api_title (title(64)),
  KEY idx_dfc_api_agent_calls (agent_call_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

let ensured = false;
let configColumnEnsured = false;
let agentCallCountColumnEnsured = false;

async function ensureAgentCallCountColumn() {
  if (agentCallCountColumnEnsured) {
    return;
  }
  try {
    await getAppMysqlPool().query(
      `ALTER TABLE dfc_api_endpoints ADD COLUMN agent_call_count INT NOT NULL DEFAULT 0 AFTER enabled`,
    );
  } catch {
    // column already exists
  }
  try {
    await getAppMysqlPool().query(
      `CREATE INDEX idx_dfc_api_agent_calls ON dfc_api_endpoints (agent_call_count)`,
    );
  } catch {
    // index already exists
  }
  agentCallCountColumnEnsured = true;
}

async function ensureTestConfigColumn() {
  if (configColumnEnsured) {
    return;
  }
  try {
    await getAppMysqlPool().query(
      `ALTER TABLE dfc_api_endpoints ADD COLUMN default_test_config_json JSON NULL AFTER default_test_params_json`,
    );
  } catch {
    // column already exists
  }
  configColumnEnsured = true;
}

export async function ensureDfcApiEndpointsTable() {
  if (ensured) {
    await ensureTestConfigColumn();
    await ensureAgentCallCountColumn();
    return;
  }
  await getAppMysqlPool().query(CREATE_SQL);
  await ensureTestConfigColumn();
  await ensureAgentCallCountColumn();
  ensured = true;
}

const SELECT_COLUMNS = `id, app_code, kind, title, description, read_only, base_url_env_key,
            endpoint_json, default_test_params_json, default_test_config_json, seeded, enabled,
            agent_call_count, created_by, created_at, updated_at`;

function resolveRowTestConfig(
  row: DfcApiEndpointRow,
  endpoint: DfcApiEndpoint,
): DfcApiTestConfig {
  const stored = parseStoredTestConfig(row.default_test_config_json);
  if (stored) {
    return mergeTestConfig(stored, endpoint);
  }
  const legacyParams = parseDefaultTestParams(row.default_test_params_json);
  if (Object.keys(legacyParams).length > 0) {
    return mergeTestConfig(
      {
        params: legacyParams,
        headers: inferDefaultTestConfig(endpoint).headers,
        query: inferDefaultTestConfig(endpoint).query,
        body: inferDefaultTestConfig(endpoint).body,
      },
      endpoint,
    );
  }
  return inferDefaultTestConfig(endpoint);
}

function mapRow(row: DfcApiEndpointRow): StoredDfcApiEndpoint {
  const endpoint = parseStoredEndpointJson(row.endpoint_json);
  const defaultTestConfig = resolveRowTestConfig(row, endpoint);
  return {
    id: row.id,
    appCode: row.app_code,
    kind: row.kind === "dubbo" ? "dubbo" : "http",
    title: row.title,
    description: row.description ?? "",
    readOnly: Boolean(row.read_only),
    baseUrlEnvKey: row.base_url_env_key,
    endpoint,
    defaultTestParams: defaultTestConfig.params,
    defaultTestConfig,
    seeded: Boolean(row.seeded),
    enabled: Boolean(row.enabled),
    agentCallCount: Number(row.agent_call_count ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by,
  };
}

export async function countMysqlDfcApiEndpoints() {
  await ensureDfcApiEndpointsTable();
  const rows = await queryAppMysql<RowDataPacket & { total: number }>(
    `SELECT COUNT(*) AS total FROM dfc_api_endpoints`,
  );
  return Number(rows[0]?.total ?? 0);
}

export type DfcApiAppSummary = {
  appCode: string;
  total: number;
  httpCount: number;
  dubboCount: number;
};

export async function deleteMysqlDfcApiEndpointsByKind(kind: "dubbo" | "http") {
  await ensureDfcApiEndpointsTable();
  const result = await executeAppMysql(
    `DELETE FROM dfc_api_endpoints WHERE kind = ?`,
    [kind],
  );
  return result.affectedRows ?? 0;
}

export async function deleteMysqlSeededEndpointsNotIn(keepIds: string[]) {
  await ensureDfcApiEndpointsTable();
  const keep = new Set(keepIds);
  const rows = await queryAppMysql<RowDataPacket & { id: string }>(
    `SELECT id FROM dfc_api_endpoints WHERE seeded = 1`,
  );
  const stale = rows.map((row) => row.id).filter((id) => !keep.has(id));
  if (!stale.length) {
    return 0;
  }

  let removed = 0;
  const chunkSize = 200;
  for (let index = 0; index < stale.length; index += chunkSize) {
    const chunk = stale.slice(index, index + chunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await executeAppMysql(
      `DELETE FROM dfc_api_endpoints WHERE seeded = 1 AND id IN (${placeholders})`,
      chunk,
    );
    removed += result.affectedRows ?? 0;
  }
  return removed;
}

export async function listMysqlDfcApiAppSummaries(): Promise<DfcApiAppSummary[]> {
  await ensureDfcApiEndpointsTable();
  const rows = await queryAppMysql<
    RowDataPacket & { app_code: string; total: number; http_count: number; dubbo_count: number }
  >(
    `SELECT app_code,
            COUNT(*) AS total,
            SUM(kind = 'http') AS http_count,
            SUM(kind = 'dubbo') AS dubbo_count
     FROM dfc_api_endpoints
     WHERE enabled = 1 AND kind = 'http'
     GROUP BY app_code
     ORDER BY total DESC, app_code ASC`,
  );
  return rows.map((row) => ({
    appCode: row.app_code,
    total: Number(row.total ?? 0),
    httpCount: Number(row.http_count ?? 0),
    dubboCount: Number(row.dubbo_count ?? 0),
  }));
}

export async function listAllMysqlDfcApiEndpoints() {
  await ensureDfcApiEndpointsTable();
  const rows = await queryAppMysql<DfcApiEndpointRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM dfc_api_endpoints
     WHERE enabled = 1 AND kind = 'http'
     ${DFC_API_LIST_ORDER_BY_SQL}`,
  );
  return rows.map(mapRow);
}

export async function getMysqlDfcApiEndpointById(id: string) {
  await ensureDfcApiEndpointsTable();
  const rows = await queryAppMysql<DfcApiEndpointRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM dfc_api_endpoints
     WHERE id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Agent 通过 call_backend_api / dfc_call_http_api 调用时累计次数 */
export async function recordDfcApiAgentCall(endpointId: string) {
  await ensureDfcApiEndpointsTable();
  const trimmed = endpointId.trim();
  if (!trimmed) {
    return;
  }
  await executeAppMysql(
    `UPDATE dfc_api_endpoints SET agent_call_count = agent_call_count + 1 WHERE id = ?`,
    [trimmed],
  );
}

export async function listMysqlDfcApiEndpointsPage(options?: {
  page?: number;
  pageSize?: number;
  q?: string;
  kind?: "all" | "http" | "dubbo";
  appCode?: string;
  enabledOnly?: boolean;
}) {
  await ensureDfcApiEndpointsTable();

  const pageSize = Math.min(Math.max(options?.pageSize ?? 20, 1), 100);
  const page = Math.max(options?.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const q = options?.q?.trim() ?? "";
  const appCode = options?.appCode?.trim() ?? "";
  const kind = options?.kind ?? "http";
  const enabledOnly = options?.enabledOnly !== false;

  const where: string[] = [];
  const params: SqlParam[] = [];

  if (enabledOnly) {
    where.push("enabled = 1");
  }
  if (kind !== "all") {
    where.push("kind = ?");
    params.push(kind);
  }
  if (appCode) {
    where.push("app_code = ?");
    params.push(appCode);
  }
  if (q) {
    where.push(
      `(id LIKE ? OR title LIKE ? OR description LIKE ? OR app_code LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(endpoint_json, '$.http.path')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(endpoint_json, '$.dubbo.interfaceName')) LIKE ?)`,
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRows = await queryAppMysql<RowDataPacket & { total: number }>(
    `SELECT COUNT(*) AS total FROM dfc_api_endpoints ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const rows = await queryAppMysql<DfcApiEndpointRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM dfc_api_endpoints
     ${whereSql}
     ${DFC_API_LIST_ORDER_BY_SQL}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (safePage - 1) * pageSize],
  );

  return {
    items: rows.map(mapRow),
    total,
    page: safePage,
    pageSize,
    catalogSize: await countMysqlDfcApiEndpoints(),
  };
}

export async function upsertMysqlDfcApiEndpoint(input: {
  endpoint: DfcApiEndpoint;
  defaultTestParams?: ApiRouteParams;
  defaultTestConfig?: DfcApiTestConfig;
  seeded?: boolean;
  enabled?: boolean;
  createdBy?: string;
}) {
  await ensureDfcApiEndpointsTable();

  const endpoint = input.endpoint;
  const defaultTestConfig =
    input.defaultTestConfig ?? inferDefaultTestConfig(endpoint);
  const now = new Date();

  await executeAppMysql(
    `INSERT INTO dfc_api_endpoints
       (id, app_code, kind, title, description, read_only, base_url_env_key,
        endpoint_json, default_test_params_json, default_test_config_json, seeded, enabled, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       app_code = VALUES(app_code),
       kind = VALUES(kind),
       title = VALUES(title),
       description = VALUES(description),
       read_only = VALUES(read_only),
       base_url_env_key = VALUES(base_url_env_key),
       endpoint_json = VALUES(endpoint_json),
       default_test_params_json = VALUES(default_test_params_json),
       default_test_config_json = VALUES(default_test_config_json),
       enabled = VALUES(enabled),
       updated_at = VALUES(updated_at)`,
    [
      endpoint.id,
      endpoint.appCode,
      endpoint.kind,
      endpoint.title.slice(0, 256),
      endpoint.description.slice(0, 65000),
      endpoint.readOnly ? 1 : 0,
      endpoint.baseUrlEnvKey,
      JSON.stringify(serializeDfcApiEndpoint(endpoint)),
      JSON.stringify(defaultTestConfig.params),
      JSON.stringify(defaultTestConfig),
      input.seeded === false ? 0 : 1,
      input.enabled !== false ? 1 : 0,
      input.createdBy ?? "system",
      now,
      now,
    ],
  );

  return getMysqlDfcApiEndpointById(endpoint.id);
}

export async function updateMysqlDfcApiEndpoint(
  id: string,
  input: {
    title?: string;
    description?: string;
    readOnly?: boolean;
    enabled?: boolean;
    defaultTestParams?: ApiRouteParams;
    defaultTestConfig?: DfcApiTestConfig;
    endpoint?: DfcApiEndpoint;
  },
) {
  const current = await getMysqlDfcApiEndpointById(id);
  if (!current) {
    return null;
  }

  const endpoint = input.endpoint ?? current.endpoint;
  const defaultTestConfig =
    input.defaultTestConfig ??
    (input.defaultTestParams
      ? {
          ...current.defaultTestConfig,
          params: input.defaultTestParams,
        }
      : current.defaultTestConfig);
  const next: StoredDfcApiEndpoint = {
    ...current,
    title: (input.title ?? current.title).slice(0, 256),
    description: (input.description ?? current.description).slice(0, 65000),
    readOnly: input.readOnly ?? current.readOnly,
    enabled: input.enabled ?? current.enabled,
    defaultTestParams: defaultTestConfig.params,
    defaultTestConfig,
    endpoint: {
      ...endpoint,
      title: (input.title ?? endpoint.title).slice(0, 256),
      description: (input.description ?? endpoint.description).slice(0, 65000),
      readOnly: input.readOnly ?? endpoint.readOnly,
    },
    updatedAt: new Date().toISOString(),
  };

  await executeAppMysql(
    `UPDATE dfc_api_endpoints
     SET app_code = ?, kind = ?, title = ?, description = ?, read_only = ?,
         base_url_env_key = ?, endpoint_json = ?, default_test_params_json = ?,
         default_test_config_json = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
    [
      next.endpoint.appCode,
      next.endpoint.kind,
      next.title,
      next.description,
      next.readOnly ? 1 : 0,
      next.endpoint.baseUrlEnvKey,
      JSON.stringify(serializeDfcApiEndpoint(next.endpoint)),
      JSON.stringify(next.defaultTestConfig.params),
      JSON.stringify(next.defaultTestConfig),
      next.enabled ? 1 : 0,
      new Date(next.updatedAt),
      id,
    ],
  );

  return getMysqlDfcApiEndpointById(id);
}

export async function deleteMysqlDfcApiEndpoint(id: string) {
  await ensureDfcApiEndpointsTable();
  const result = await executeAppMysql(
    `DELETE FROM dfc_api_endpoints WHERE id = ? AND seeded = 0`,
    [id],
  );
  return result.affectedRows > 0;
}

export async function batchUpsertMysqlDfcApiEndpoints(
  endpoints: DfcApiEndpoint[],
  options?: { seeded?: boolean; createdBy?: string },
) {
  await ensureDfcApiEndpointsTable();
  const chunkSize = 200;
  let inserted = 0;

  for (let index = 0; index < endpoints.length; index += chunkSize) {
    const chunk = endpoints.slice(index, index + chunkSize);
    const values: SqlParam[] = [];
    const placeholders: string[] = [];
    const now = new Date();

    for (const endpoint of chunk) {
      const defaultTestConfig = inferDefaultTestConfig(endpoint);
      placeholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      values.push(
        endpoint.id,
        endpoint.appCode,
        endpoint.kind,
        endpoint.title.slice(0, 256),
        endpoint.description.slice(0, 65000),
        endpoint.readOnly ? 1 : 0,
        endpoint.baseUrlEnvKey,
        JSON.stringify(serializeDfcApiEndpoint(endpoint)),
        JSON.stringify(defaultTestConfig.params),
        JSON.stringify(defaultTestConfig),
        options?.seeded === false ? 0 : 1,
        1,
        options?.createdBy ?? "system",
        now,
        now,
      );
    }

    const result = await executeAppMysql(
      `INSERT INTO dfc_api_endpoints
         (id, app_code, kind, title, description, read_only, base_url_env_key,
          endpoint_json, default_test_params_json, default_test_config_json, seeded, enabled, created_by, created_at, updated_at)
       VALUES ${placeholders.join(", ")}
       ON DUPLICATE KEY UPDATE
         app_code = VALUES(app_code),
         kind = VALUES(kind),
         title = VALUES(title),
         description = VALUES(description),
         read_only = VALUES(read_only),
         base_url_env_key = VALUES(base_url_env_key),
         endpoint_json = VALUES(endpoint_json),
         default_test_params_json = VALUES(default_test_params_json),
         default_test_config_json = VALUES(default_test_config_json),
         updated_at = VALUES(updated_at)`,
      values,
    );
    inserted += result.affectedRows;
  }

  return inserted;
}

export function resetMysqlDfcApiEndpointsEnsure() {
  ensured = false;
}

export async function getDefaultTestParamsByEndpointId(id: string) {
  const record = await getMysqlDfcApiEndpointById(id);
  if (!record) {
    return null;
  }
  return record.defaultTestParams;
}

export async function getDefaultTestParamsMap(ids: string[]) {
  if (!ids.length) {
    return {};
  }
  await ensureDfcApiEndpointsTable();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await queryAppMysql<
    RowDataPacket & { id: string; default_test_params_json: unknown }
  >(
    `SELECT id, default_test_params_json
     FROM dfc_api_endpoints
     WHERE id IN (${placeholders})`,
    ids,
  );
  return Object.fromEntries(
    rows.map((row) => [row.id, parseDefaultTestParams(row.default_test_params_json)]),
  ) as Record<string, ApiRouteParams>;
}

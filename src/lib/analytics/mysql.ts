import { AsyncLocalStorage } from "node:async_hooks";

import mysql, { type Pool, type PoolOptions, type RowDataPacket } from "mysql2/promise";

export type AnalyticsEnvId = string;

export type AnalyticsMysqlConfig = {
  env: string;
  host: string;
  port: number;
  /** 可选：MySQL 连接 bootstrap 库，不作为 Agent 默认查询库 */
  database?: string;
  user: string;
  password: string;
  ssl: boolean;
  connectTimeoutMs: number;
  queryTimeoutMs: number;
  maxRows: number;
};

export type AnalyticsEnvProfile = {
  id: string;
  label: string;
  configured: boolean;
  host?: string;
  database?: string;
};

/** 大风车默认三套数据环境（未配置 ANALYTICS_MYSQL_PROFILES 时使用） */
export const DEFAULT_ANALYTICS_ENVS = ["test", "prepub", "prod"] as const;

const envStore = new AsyncLocalStorage<AnalyticsEnvId>();

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envKey(prefix: string, name: string, suffix: string) {
  return process.env[`${prefix}_${name.toUpperCase()}_${suffix}`]?.trim();
}

function defaultEnvId() {
  return process.env.ANALYTICS_MYSQL_ENV?.trim() || "test";
}

/** 已声明的环境列表，如 test,prepub,prod */
export function listDeclaredAnalyticsEnvs(): string[] {
  const raw = process.env.ANALYTICS_MYSQL_PROFILES?.trim();

  if (raw) {
    return raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  return [...DEFAULT_ANALYTICS_ENVS];
}

export function getAnalyticsEnvLabel(id: string): string {
  const normalized = id.trim().toLowerCase();

  if (normalized === "test") {
    return "测试";
  }

  if (normalized === "prepub" || normalized === "pre") {
    return "预发";
  }

  if (normalized === "prod" || normalized === "online" || normalized === "production") {
    return "线上";
  }

  return id;
}

function loadProfileConfig(envId: string): AnalyticsMysqlConfig | null {
  const id = envId.trim().toLowerCase() || defaultEnvId();
  const upper = id.toUpperCase();

  const host =
    envKey("ANALYTICS_MYSQL", upper, "HOST") ||
    (id === defaultEnvId().toLowerCase()
      ? process.env.ANALYTICS_MYSQL_HOST?.trim()
      : undefined);
  const database =
    envKey("ANALYTICS_MYSQL", upper, "DATABASE") ||
    (id === defaultEnvId().toLowerCase()
      ? process.env.ANALYTICS_MYSQL_DATABASE?.trim()
      : undefined);
  const user =
    envKey("ANALYTICS_MYSQL", upper, "USER") ||
    (id === defaultEnvId().toLowerCase()
      ? process.env.ANALYTICS_MYSQL_USER?.trim()
      : undefined);
  const password =
    envKey("ANALYTICS_MYSQL", upper, "PASSWORD") ??
    (id === defaultEnvId().toLowerCase()
      ? (process.env.ANALYTICS_MYSQL_PASSWORD ?? "")
      : "");

  if (!host || !user) {
    // fall back to default ANALYTICS_MYSQL_* when profile-specific missing
    if (id !== defaultEnvId().toLowerCase()) {
      return null;
    }

    const fallbackHost = process.env.ANALYTICS_MYSQL_HOST?.trim();
    const fallbackUser = process.env.ANALYTICS_MYSQL_USER?.trim();

    if (!fallbackHost || !fallbackUser) {
      return null;
    }

    const fallbackDatabase = process.env.ANALYTICS_MYSQL_DATABASE?.trim();

    return {
      env: id,
      host: fallbackHost,
      port: parsePositiveInt(process.env.ANALYTICS_MYSQL_PORT, 3306),
      database: fallbackDatabase || undefined,
      user: fallbackUser,
      password: process.env.ANALYTICS_MYSQL_PASSWORD ?? "",
      ssl: process.env.ANALYTICS_MYSQL_SSL === "true",
      connectTimeoutMs: parsePositiveInt(
        process.env.ANALYTICS_MYSQL_CONNECT_TIMEOUT_MS,
        8000,
      ),
      queryTimeoutMs: parsePositiveInt(
        process.env.ANALYTICS_MYSQL_QUERY_TIMEOUT_MS,
        15000,
      ),
      maxRows: parsePositiveInt(process.env.ANALYTICS_MYSQL_MAX_ROWS, 500),
    };
  }

  return {
    env: id,
    host,
    port: parsePositiveInt(
      envKey("ANALYTICS_MYSQL", upper, "PORT") || process.env.ANALYTICS_MYSQL_PORT,
      3306,
    ),
    database: database || undefined,
    user,
    password,
    ssl:
      (envKey("ANALYTICS_MYSQL", upper, "SSL") || process.env.ANALYTICS_MYSQL_SSL) ===
      "true",
    connectTimeoutMs: parsePositiveInt(
      process.env.ANALYTICS_MYSQL_CONNECT_TIMEOUT_MS,
      8000,
    ),
    queryTimeoutMs: parsePositiveInt(
      process.env.ANALYTICS_MYSQL_QUERY_TIMEOUT_MS,
      15000,
    ),
    maxRows: parsePositiveInt(process.env.ANALYTICS_MYSQL_MAX_ROWS, 500),
  };
}

export function resolveAnalyticsEnvId(requested?: string | null) {
  const declared = listDeclaredAnalyticsEnvs();
  const configuredFallback =
    declared.find((id) => loadProfileConfig(id)) ??
    declared.find((id) => id === defaultEnvId().toLowerCase()) ??
    declared[0] ??
    defaultEnvId().toLowerCase();

  if (!requested?.trim()) {
    return configuredFallback;
  }

  const normalized = requested.trim().toLowerCase();

  if (!declared.includes(normalized)) {
    throw new Error(
      `未知分析环境「${requested}」。可选：${declared.join(", ")}`,
    );
  }

  if (!loadProfileConfig(normalized)) {
    throw new Error(`分析环境「${normalized}」未配置完整连接信息`);
  }

  return normalized;
}

export function listAnalyticsEnvProfiles(): AnalyticsEnvProfile[] {
  return listDeclaredAnalyticsEnvs().map((id) => {
    const config = loadProfileConfig(id);
    return {
      id,
      label: getAnalyticsEnvLabel(id),
      configured: Boolean(config),
      host: config?.host,
      database: config?.database,
    };
  });
}

export function runWithAnalyticsEnv<T>(
  envId: string,
  fn: () => T,
): T {
  return envStore.run(envId, fn);
}

export function getActiveAnalyticsEnvId() {
  return envStore.getStore() ?? listDeclaredAnalyticsEnvs()[0] ?? defaultEnvId();
}

export function getAnalyticsMysqlConfig(): AnalyticsMysqlConfig | null {
  const envId = getActiveAnalyticsEnvId();
  return loadProfileConfig(envId);
}

const pools = new Map<string, Pool>();

function buildPoolKey(config: AnalyticsMysqlConfig) {
  return [
    config.env,
    config.host,
    config.port,
    config.database ?? "(auto)",
    config.user,
    config.ssl ? "ssl" : "nossl",
  ].join("|");
}

export function getAnalyticsMysqlPool(): Pool | null {
  const config = getAnalyticsMysqlConfig();

  if (!config) {
    return null;
  }

  const key = buildPoolKey(config);
  const existing = pools.get(key);

  if (existing) {
    return existing;
  }

  const options: PoolOptions = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    ...(config.database ? { database: config.database } : {}),
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: config.connectTimeoutMs,
    enableKeepAlive: true,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  };

  const pool = mysql.createPool(options);
  pools.set(key, pool);
  return pool;
}

export async function checkAnalyticsMysqlHealth(): Promise<{
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  env?: string;
  host?: string;
  database?: string;
  error?: string;
}> {
  const config = getAnalyticsMysqlConfig();

  if (!config) {
    return { configured: false, ok: false, latencyMs: 0 };
  }

  const started = performance.now();
  const activePool = getAnalyticsMysqlPool();

  if (!activePool) {
    return {
      configured: true,
      ok: false,
      latencyMs: 0,
      env: config.env,
      host: config.host,
      database: config.database,
      error: "pool unavailable",
    };
  }

  try {
    const connection = await activePool.getConnection();

    try {
      await connection.query({
        sql: "SELECT 1 AS ok",
        timeout: config.queryTimeoutMs,
      });
    } finally {
      connection.release();
    }

    return {
      configured: true,
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      env: config.env,
      host: config.host,
      database: config.database,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      env: config.env,
      host: config.host,
      database: config.database,
      error: error instanceof Error ? error.message : "connection failed",
    };
  }
}

export async function queryAnalyticsMysql<T extends RowDataPacket[]>(
  sql: string,
): Promise<{ rows: T; fields: string[] }> {
  return queryAnalyticsMysqlWithParams(sql, []);
}

export async function queryAnalyticsMysqlWithParams<T extends RowDataPacket[]>(
  sql: string,
  params: unknown[],
): Promise<{ rows: T; fields: string[] }> {
  const config = getAnalyticsMysqlConfig();
  const activePool = getAnalyticsMysqlPool();

  if (!config || !activePool) {
    throw new Error(
      "分析库未配置：请在 .env 中设置 ANALYTICS_MYSQL_HOST / USER / PASSWORD（需内网访问 *.scsite.net）",
    );
  }

  const [rows, fields] = await activePool.query<T>({
    sql,
    timeout: config.queryTimeoutMs,
    values: params,
  });

  const fieldNames = Array.isArray(fields)
    ? fields.map((field) => String(field.name))
    : [];

  return { rows, fields: fieldNames };
}

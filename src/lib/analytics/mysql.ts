import mysql, { type Pool, type PoolOptions, type RowDataPacket } from "mysql2/promise";

export type AnalyticsMysqlConfig = {
  env: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  connectTimeoutMs: number;
  queryTimeoutMs: number;
  maxRows: number;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getAnalyticsMysqlConfig(): AnalyticsMysqlConfig | null {
  const host = process.env.ANALYTICS_MYSQL_HOST?.trim();
  const database = process.env.ANALYTICS_MYSQL_DATABASE?.trim();
  const user = process.env.ANALYTICS_MYSQL_USER?.trim();
  const password = process.env.ANALYTICS_MYSQL_PASSWORD ?? "";

  if (!host || !database || !user) {
    return null;
  }

  return {
    env: process.env.ANALYTICS_MYSQL_ENV?.trim() || "test",
    host,
    port: parsePositiveInt(process.env.ANALYTICS_MYSQL_PORT, 3306),
    database,
    user,
    password,
    ssl: process.env.ANALYTICS_MYSQL_SSL === "true",
    connectTimeoutMs: parsePositiveInt(process.env.ANALYTICS_MYSQL_CONNECT_TIMEOUT_MS, 8000),
    queryTimeoutMs: parsePositiveInt(process.env.ANALYTICS_MYSQL_QUERY_TIMEOUT_MS, 15000),
    maxRows: parsePositiveInt(process.env.ANALYTICS_MYSQL_MAX_ROWS, 500),
  };
}

let pool: Pool | null = null;
let poolKey = "";

function buildPoolKey(config: AnalyticsMysqlConfig) {
  return [
    config.env,
    config.host,
    config.port,
    config.database,
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

  if (!pool || poolKey !== key) {
    const options: PoolOptions = {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: config.connectTimeoutMs,
      enableKeepAlive: true,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    };

    pool = mysql.createPool(options);
    poolKey = key;
  }

  return pool;
}

export async function checkAnalyticsMysqlHealth(): Promise<{
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  env?: string;
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
      database: config.database,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      env: config.env,
      database: config.database,
      error: error instanceof Error ? error.message : "connection failed",
    };
  }
}

export async function queryAnalyticsMysql<T extends RowDataPacket[]>(
  sql: string,
): Promise<{ rows: T; fields: string[] }> {
  const config = getAnalyticsMysqlConfig();
  const activePool = getAnalyticsMysqlPool();

  if (!config || !activePool) {
    throw new Error(
      "分析库未配置：请在 .env 中设置 ANALYTICS_MYSQL_HOST / DATABASE / USER / PASSWORD（需内网访问 *.scsite.net）",
    );
  }

  const [rows, fields] = await activePool.query<T>({
    sql,
    timeout: config.queryTimeoutMs,
  });

  const fieldNames = Array.isArray(fields)
    ? fields.map((field) => String(field.name))
    : [];

  return { rows, fields: fieldNames };
}

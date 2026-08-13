import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

const globalStore = globalThis as typeof globalThis & {
  __dfcAgentAppMysqlPool?: Pool;
};

export type AppMysqlConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function getAppMysqlConfig(): AppMysqlConfig | null {
  if (process.env.VITEST === "true") {
    return null;
  }

  const host = process.env.APP_MYSQL_HOST?.trim();
  const user = process.env.APP_MYSQL_USER?.trim();
  if (!host || !user) {
    return null;
  }

  return {
    host,
    port: Number.parseInt(process.env.APP_MYSQL_PORT?.trim() || "3306", 10) || 3306,
    user,
    password: process.env.APP_MYSQL_PASSWORD ?? "",
    database: process.env.APP_MYSQL_DATABASE?.trim() || "dfc_data_agent",
  };
}

export function isAppMysqlConfigured() {
  return Boolean(getAppMysqlConfig());
}

export function getAppMysqlPool() {
  const config = getAppMysqlConfig();
  if (!config) {
    throw new Error("APP_MYSQL_* is not configured");
  }

  if (!globalStore.__dfcAgentAppMysqlPool) {
    globalStore.__dfcAgentAppMysqlPool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 8,
      charset: "utf8mb4",
      timezone: "Z",
    });
  }

  return globalStore.__dfcAgentAppMysqlPool;
}

type SqlParam = string | number | boolean | Date | Buffer | null;

export async function queryAppMysql<T extends RowDataPacket>(
  sql: string,
  params: SqlParam[] = [],
) {
  const [rows] = await getAppMysqlPool().query<T[]>(sql, params);
  return rows;
}

export async function executeAppMysql(sql: string, params: SqlParam[] = []) {
  const [result] = await getAppMysqlPool().execute<ResultSetHeader>(sql, params);
  return result;
}

export async function checkAppMysqlHealth() {
  const config = getAppMysqlConfig();
  if (!config) {
    return {
      configured: false,
      ok: true,
      latencyMs: 0,
      host: undefined as string | undefined,
      database: undefined as string | undefined,
      error: undefined as string | undefined,
    };
  }

  const started = performance.now();
  try {
    await queryAppMysql("SELECT 1 AS ok");
    return {
      configured: true,
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      host: config.host,
      database: config.database,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      host: config.host,
      database: config.database,
      error: error instanceof Error ? error.message : "connect failed",
    };
  }
}

export async function closeAppMysqlPool() {
  if (globalStore.__dfcAgentAppMysqlPool) {
    await globalStore.__dfcAgentAppMysqlPool.end();
    globalStore.__dfcAgentAppMysqlPool = undefined;
  }
}

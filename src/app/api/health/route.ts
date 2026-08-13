import { NextResponse } from "next/server";

import { checkAnalyticsMysqlHealth, listAnalyticsEnvProfiles } from "@/lib/analytics/mysql";
import { checkAppMysqlHealth } from "@/lib/app-mysql/client";
import { getAgentMaxSteps } from "@/lib/agent/config";
import { checkLlmHealth, isLlmConfigured } from "@/lib/llm-config";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import {
  collectProductionIssues,
  isProductionStrict,
} from "@/lib/security/production-config";
import { getAuthMode, isAuthEnabled } from "@/lib/security/auth-config";
import { getTableAllowlist } from "@/lib/security/table-allowlist";

async function checkRedisHealth() {
  if (!isRedisConfigured()) {
    return { configured: false, ok: true, latencyMs: 0 };
  }

  const started = performance.now();
  const client = await getRedisClient();

  if (!client) {
    return {
      configured: true,
      ok: false,
      latencyMs: 0,
      error: "connect failed",
    };
  }

  try {
    await client.ping();
    return {
      configured: true,
      ok: true,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "ping failed",
    };
  }
}

export async function GET() {
  const started = performance.now();
  const [analyticsMysql, appMysql, llm, redis] = await Promise.all([
    checkAnalyticsMysqlHealth(),
    checkAppMysqlHealth(),
    checkLlmHealth(),
    checkRedisHealth(),
  ]);

  const allowlist = getTableAllowlist();
  const productionIssues = collectProductionIssues();
  const llmRequired = process.env.LLM_REQUIRE === "1";
  const redisRequired = process.env.REDIS_REQUIRED === "1";

  const mysqlReady = !analyticsMysql.configured || analyticsMysql.ok;
  const llmReady = !llmRequired || (isLlmConfigured() && llm.ok);
  const redisReady = !redisRequired || (redis.configured && redis.ok);
  const securityReady = !isProductionStrict() || productionIssues.length === 0;

  const ready = mysqlReady && llmReady && redisReady && securityReady;
  const ok = mysqlReady;

  return NextResponse.json(
    {
      ok,
      ready,
      analyticsMysql: {
        configured: analyticsMysql.configured,
        ok: analyticsMysql.ok,
        latencyMs: analyticsMysql.latencyMs,
        env: analyticsMysql.env,
        host: analyticsMysql.host,
        database: analyticsMysql.database,
        error: analyticsMysql.error,
        tableAllowlistEnabled: Boolean(allowlist),
        tableAllowlistCount: allowlist?.size ?? 0,
        profiles: listAnalyticsEnvProfiles(),
      },
      appMysql: {
        configured: appMysql.configured,
        ok: appMysql.ok,
        latencyMs: appMysql.latencyMs,
        host: appMysql.host,
        database: appMysql.database,
        error: appMysql.error,
      },
      llm: {
        configured: llm.configured,
        ok: llm.ok,
        latencyMs: llm.latencyMs,
        label: llm.label,
        required: llmRequired,
        error: llm.error,
      },
      redis: {
        configured: redis.configured,
        ok: redis.ok,
        latencyMs: redis.latencyMs,
        required: redisRequired,
        error: redis.error,
      },
      security: {
        authEnabled: isAuthEnabled(),
        authMode: isAuthEnabled() ? getAuthMode() : "disabled",
        productionStrict: isProductionStrict(),
        productionIssues,
      },
      agent: { maxSteps: getAgentMaxSteps() },
      server: {
        node: process.version,
        totalMs: Math.round(performance.now() - started),
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready || !isProductionStrict() ? 200 : 503,
    },
  );
}

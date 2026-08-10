import { NextResponse } from "next/server";

import { checkAnalyticsMysqlHealth } from "@/lib/analytics/mysql";
import { getAgentMaxSteps } from "@/lib/agent/config";
import { getLlmLabel, isLlmConfigured } from "@/lib/llm-config";

export async function GET() {
  const started = performance.now();
  const analyticsMysql = await checkAnalyticsMysqlHealth();

  const llmConfigured = isLlmConfigured();
  let llmLabel = "unconfigured";

  try {
    llmLabel = getLlmLabel();
  } catch {
    llmLabel = "misconfigured";
  }

  const totalMs = Math.round(performance.now() - started);
  const mysqlReady = !analyticsMysql.configured || analyticsMysql.ok;
  const ready = mysqlReady && llmConfigured;
  const ok = mysqlReady;

  return NextResponse.json({
    ok,
    ready,
    analyticsMysql: {
      configured: analyticsMysql.configured,
      ok: analyticsMysql.ok,
      latencyMs: analyticsMysql.latencyMs,
      env: analyticsMysql.env,
      database: analyticsMysql.database,
      error: analyticsMysql.error,
    },
    llm: { configured: llmConfigured, label: llmLabel },
    agent: { maxSteps: getAgentMaxSteps() },
    server: {
      node: process.version,
      totalMs,
    },
    timestamp: new Date().toISOString(),
  });
}

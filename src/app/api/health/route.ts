import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getLlmLabel, isLlmConfigured } from "@/lib/llm-config";
import { isPgTrgmEnabled } from "@/lib/pg-trgm";

export async function GET() {
  const started = performance.now();
  let dbOk = false;
  let dbMs = 0;
  let pgTrgm = false;

  const db = getDb();

  if (db) {
    const dbStarted = performance.now();

    try {
      await db.$queryRaw`SELECT 1`;
      dbOk = true;
      dbMs = Math.round(performance.now() - dbStarted);
      pgTrgm = await isPgTrgmEnabled();
    } catch {
      dbOk = false;
    }
  }

  const llmConfigured = isLlmConfigured();
  let llmLabel = "unconfigured";

  try {
    llmLabel = getLlmLabel();
  } catch {
    llmLabel = "misconfigured";
  }

  const totalMs = Math.round(performance.now() - started);
  const ready = dbOk && llmConfigured;
  const ok = dbOk;

  return NextResponse.json({
    ok,
    ready,
    db: { connected: Boolean(db), ok: dbOk, latencyMs: dbMs },
    llm: { configured: llmConfigured, label: llmLabel },
    search: { pgTrgm },
    server: {
      node: process.version,
      totalMs,
    },
    timestamp: new Date().toISOString(),
  });
}

import type { AgentToolResult } from "@/lib/agent/types";

export type PendingSqlRun = {
  runId: string;
  message: string;
  prior: AgentToolResult[];
  sql: string;
  explanation: string;
  createdAt: number;
  mock?: boolean;
};

const globalForPending = globalThis as typeof globalThis & {
  __homeAgentPendingSqlRuns?: Map<string, PendingSqlRun>;
};

/** Dev HMR 会重载模块；挂到 globalThis 避免待确认 SQL 丢失 */
const pendingRuns =
  globalForPending.__homeAgentPendingSqlRuns ??
  new Map<string, PendingSqlRun>();

if (!globalForPending.__homeAgentPendingSqlRuns) {
  globalForPending.__homeAgentPendingSqlRuns = pendingRuns;
}

const TTL_MS = 30 * 60 * 1000;

function pruneExpired() {
  const now = Date.now();

  for (const [runId, run] of pendingRuns) {
    if (now - run.createdAt > TTL_MS) {
      pendingRuns.delete(runId);
    }
  }
}

export function savePendingSqlRun(run: PendingSqlRun) {
  pruneExpired();
  pendingRuns.set(run.runId, run);
}

export function getPendingSqlRun(runId: string) {
  pruneExpired();
  return pendingRuns.get(runId) ?? null;
}

export function takePendingSqlRun(runId: string) {
  pruneExpired();
  const run = pendingRuns.get(runId) ?? null;

  if (run) {
    pendingRuns.delete(runId);
  }

  return run;
}

export function createRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 测试用 */
export function clearPendingSqlRunsForTest() {
  pendingRuns.clear();
}

export function pendingSqlRunCountForTest() {
  return pendingRuns.size;
}

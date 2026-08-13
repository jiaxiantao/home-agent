import { afterEach, describe, expect, it } from "vitest";

import {
  clearPendingSqlRunsForTest,
  createRunId,
  getPendingSqlRun,
  pendingSqlRunCountForTest,
  savePendingSqlRun,
  takePendingSqlRun,
} from "@/lib/agent/pending-runs";

describe("pending sql runs", () => {
  afterEach(() => {
    clearPendingSqlRunsForTest();
  });

  it("saves to memory so confirm can resume even if mysql/redis miss", async () => {
    const runId = createRunId();
    await savePendingSqlRun({
      runId,
      message: "查询车牌号为皖JV066M的车辆信息",
      prior: [],
      sql: "SELECT 1",
      explanation: "test",
      createdAt: Date.now(),
    });

    expect(pendingSqlRunCountForTest()).toBeGreaterThan(0);
    const peeked = await getPendingSqlRun(runId);
    expect(peeked?.sql).toBe("SELECT 1");

    const taken = await takePendingSqlRun(runId);
    expect(taken?.runId).toBe(runId);
    expect(await getPendingSqlRun(runId)).toBeNull();
  });
});

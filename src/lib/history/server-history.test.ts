import { describe, expect, it } from "vitest";

import {
  clearServerHistoryForTest,
  createServerHistory,
  listServerHistory,
  updateServerHistoryByRunId,
} from "@/lib/history/server-history";

describe("server-history", () => {
  it("creates and lists history for a user", async () => {
    clearServerHistoryForTest();

    const entry = await createServerHistory({
      userId: "u1",
      threadId: "t1",
      question: "车源总数？",
      status: "awaiting",
      sql: "SELECT COUNT(*) FROM car",
      runId: "run_1",
    });

    expect(entry.id).toBeTruthy();

    await updateServerHistoryByRunId("u1", "run_1", {
      status: "done",
      rowCount: 1,
      answer: "查询成功",
    });

    const list = await listServerHistory("u1");
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("done");
    expect(list[0]?.rowCount).toBe(1);
  });
});

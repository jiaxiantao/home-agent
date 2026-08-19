import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/agent-threads/route";
import {
  clearThreadsForTest,
  getUserThread,
  listUserThreadsPage,
} from "@/lib/agent/thread-store";

describe("POST /api/agent-threads", () => {
  it("creates thread and persists user message immediately", async () => {
    clearThreadsForTest();

    const response = await POST(
      new Request("http://localhost/api/agent-threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "thread_test_save",
          message: { role: "user", content: "查询 VIN TEST5566345677888", ts: 1 },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { threadId: string; title: string };
    expect(body.threadId).toBe("thread_test_save");
    expect(body.title).toContain("VIN");

    const thread = await getUserThread("thread_test_save", "dev");
    expect(thread?.messages).toHaveLength(1);
    expect(thread?.messages[0]?.content).toContain("VIN");

    const listed = await listUserThreadsPage({ userId: "dev", pageSize: 20 });
    expect(listed.total).toBeGreaterThanOrEqual(1);
    expect(listed.items.some((item) => item.threadId === "thread_test_save")).toBe(true);
  });
});

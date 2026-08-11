import { describe, expect, it } from "vitest";

import {
  clearThreadsForTest,
  createThreadId,
  ensureThread,
  getThreadMessages,
  appendThreadMessage,
} from "@/lib/agent/thread-store";

describe("thread-store", () => {
  it("creates thread and appends messages", async () => {
    clearThreadsForTest();
    const threadId = createThreadId();
    await ensureThread(threadId, "user-a");
    await appendThreadMessage(threadId, "user-a", {
      role: "user",
      content: "车源总数？",
      ts: Date.now(),
    });

    const messages = await getThreadMessages(threadId, "user-a");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain("车源");
  });
});

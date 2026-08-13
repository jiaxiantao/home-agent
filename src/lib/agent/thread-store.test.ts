import { describe, expect, it } from "vitest";

import {
  appendThreadMessage,
  clearThreadsForTest,
  createThreadId,
  deleteUserThread,
  ensureThread,
  getThreadMessages,
  getUserThread,
  listUserThreadsPage,
} from "@/lib/agent/thread-store";
import { threadMessagesToTurns } from "@/lib/agent/thread-turns";

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

  it("lists titled threads and supports continue + delete", async () => {
    clearThreadsForTest();
    const threadId = createThreadId();
    await ensureThread(threadId, "user-a");
    await appendThreadMessage(threadId, "user-a", {
      role: "user",
      content: "皖JV066M 这辆车在哪？",
      ts: Date.now(),
    });
    await appendThreadMessage(threadId, "user-a", {
      role: "assistant",
      content: "已查到车辆信息。",
      ts: Date.now() + 1,
    });

    const listed = await listUserThreadsPage({ userId: "user-a", pageSize: 10 });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.title).toContain("皖JV066M");
    expect(listed.items[0]?.threadId).toBe(threadId);

    const thread = await getUserThread(threadId, "user-a");
    expect(thread?.messages).toHaveLength(2);

    const turns = threadMessagesToTurns(thread?.messages ?? []);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.question).toContain("皖JV066M");
    expect(turns[0]?.finalAnswer).toContain("车辆");

    await expect(deleteUserThread(threadId, "user-a")).resolves.toBe(true);
    await expect(listUserThreadsPage({ userId: "user-a" })).resolves.toMatchObject({
      total: 0,
      items: [],
    });
  });

  it("hides empty threads from the history list", async () => {
    clearThreadsForTest();
    await ensureThread(createThreadId(), "user-b");
    const listed = await listUserThreadsPage({ userId: "user-b" });
    expect(listed.total).toBe(0);
  });
});

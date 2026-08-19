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
  shouldSkipDuplicateThreadMessage,
  threadListUpdatedAt,
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

  it("persists surfaces and steps on assistant messages", async () => {
    clearThreadsForTest();
    const threadId = createThreadId();
    await ensureThread(threadId, "user-a");
    await appendThreadMessage(threadId, "user-a", {
      role: "user",
      content: "用饼图看签署状态",
      ts: Date.now(),
    });
    await appendThreadMessage(threadId, "user-a", {
      role: "assistant",
      content: "饼图已生成",
      ts: Date.now() + 1,
      surfaces: [
        {
          surfaceId: "result_1",
          title: "查询结果",
          components: [
            {
              id: "chart",
              type: "Chart",
              chart: {
                type: "pie",
                title: "签署状态",
                xKey: "name",
                yKey: "value",
                data: [{ name: "已完成", value: 8 }],
              },
            },
          ],
        },
      ],
      steps: [
        { id: "plan_1", kind: "plan", title: "生成图表", status: "done" },
      ],
    });

    const thread = await getUserThread(threadId, "user-a");
    const turns = threadMessagesToTurns(thread?.messages ?? []);
    expect(turns[0]?.surfaces).toHaveLength(1);
    expect(turns[0]?.steps).toHaveLength(1);
    expect(turns[0]?.surfaces[0]?.components[0]?.type).toBe("Chart");

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

  it("lists activity time from the last message instead of a skewed DB timestamp", async () => {
    const messageAt = Date.parse("2026-08-14T03:00:51.000Z");
    const skewedUpdatedAt = Date.parse("2026-08-14T11:00:51.000Z");

    expect(
      threadListUpdatedAt({
        updatedAt: skewedUpdatedAt,
        messages: [{ role: "user", content: "正式车源售价区间", ts: messageAt }],
      }),
    ).toBe(messageAt);

    clearThreadsForTest();
    const threadId = createThreadId();
    await ensureThread(threadId, "user-a");
    await appendThreadMessage(threadId, "user-a", {
      role: "user",
      content: "正式车源售价区间",
      ts: messageAt,
    });

    const listed = await listUserThreadsPage({ userId: "user-a", pageSize: 10 });
    expect(listed.items[0]?.updatedAt).toBe(new Date(messageAt).toISOString());
  });

  it("skips duplicate adjacent messages", () => {
    expect(
      shouldSkipDuplicateThreadMessage(
        [{ role: "user", content: "你好", ts: 1 }],
        { role: "user", content: "你好" },
      ),
    ).toBe(true);
    expect(
      shouldSkipDuplicateThreadMessage(
        [{ role: "user", content: "你好", ts: 1 }],
        { role: "user", content: "再见" },
      ),
    ).toBe(false);
  });

  it("lists more than 20 saved threads with correct total", async () => {
    clearThreadsForTest();

    for (let index = 0; index < 25; index += 1) {
      const threadId = createThreadId();
      await ensureThread(threadId, "user-a");
      await appendThreadMessage(threadId, "user-a", {
        role: "user",
        content: `问题 ${index + 1}`,
        ts: Date.now() + index,
      });
    }

    const listed = await listUserThreadsPage({
      userId: "user-a",
      page: 1,
      pageSize: 20,
    });

    expect(listed.total).toBe(25);
    expect(listed.items).toHaveLength(20);

    const page2 = await listUserThreadsPage({
      userId: "user-a",
      page: 2,
      pageSize: 20,
    });
    expect(page2.total).toBe(25);
    expect(page2.items).toHaveLength(5);
  });
});

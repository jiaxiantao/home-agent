import { describe, expect, it } from "vitest";

import { threadMessagesToTurns } from "@/lib/agent/thread-turns";

describe("threadMessagesToTurns", () => {
  it("pairs user/assistant messages into conversation turns", () => {
    const turns = threadMessagesToTurns([
      { role: "user", content: "本月放款？", ts: 1 },
      { role: "assistant", content: "合计 120 万", ts: 2 },
      { role: "user", content: "按城市呢？", ts: 3 },
      { role: "assistant", content: "杭州最多", ts: 4 },
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      question: "本月放款？",
      finalAnswer: "合计 120 万",
      status: "done",
    });
    expect(turns[1]).toMatchObject({
      question: "按城市呢？",
      finalAnswer: "杭州最多",
    });
  });

  it("restores analysis steps and merges confirm + result surfaces", () => {
    const turns = threadMessagesToTurns([
      { role: "user", content: "按签署状态看电子合同，用饼图", ts: 1 },
      {
        role: "assistant",
        content: "请确认是否执行查询。",
        ts: 2,
        sql: "SELECT status, COUNT(*) FROM contract GROUP BY status",
        surfaces: [
          {
            surfaceId: "confirm_run1",
            title: "确认执行 SQL",
            components: [{ id: "sql", type: "Code", language: "sql", code: "SELECT 1" }],
          },
        ],
        steps: [
          {
            id: "plan_1",
            kind: "plan",
            title: "提议 SQL",
            status: "done",
          },
        ],
      },
      {
        role: "assistant",
        content: "已完成签署的合同最多。",
        ts: 3,
        surfaces: [
          {
            surfaceId: "result_run1",
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
                  data: [{ name: "已完成", value: 10 }],
                },
              },
            ],
          },
        ],
        steps: [
          {
            id: "tool_1",
            kind: "tool",
            title: "执行 SQL",
            status: "done",
          },
        ],
      },
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.finalAnswer).toBe("已完成签署的合同最多。");
    expect(turns[0]?.status).toBe("done");
    expect(turns[0]?.surfaces.map((surface) => surface.surfaceId)).toEqual([
      "confirm_run1",
      "result_run1",
    ]);
    expect(turns[0]?.steps.map((step) => step.id)).toEqual(["plan_1", "tool_1"]);
    expect(turns[0]?.surfaces[1]?.components.some((item) => item.type === "Chart")).toBe(
      true,
    );
  });
});

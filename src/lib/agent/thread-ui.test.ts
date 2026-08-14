import { describe, expect, it } from "vitest";

import { createTurnUiRecorder } from "@/lib/agent/thread-ui";

describe("createTurnUiRecorder", () => {
  it("records chart surfaces and analysis steps for thread persistence", () => {
    const recorder = createTurnUiRecorder();

    recorder.record({
      type: "plan",
      plan: {
        action: "tool",
        tool: "propose_sql",
        args: {},
        reasoning: "先确认 SQL",
      },
    });
    recorder.record({
      type: "a2ui",
      surface: {
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
              data: [{ name: "已完成", value: 3 }],
            },
          },
        ],
      },
    });
    recorder.record({
      type: "awaiting_input",
      runId: "run_1",
      reason: "confirm_sql",
      sql: "SELECT 1",
      explanation: "请确认",
    });

    const snapshot = recorder.snapshot();
    expect(snapshot.surfaces).toHaveLength(1);
    expect(snapshot.surfaces[0]?.components[0]?.type).toBe("Chart");
    expect(snapshot.steps.map((step) => step.kind)).toEqual(["plan", "awaiting"]);
  });
});

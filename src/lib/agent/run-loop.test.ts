import { afterEach, describe, expect, it } from "vitest";

import { runAgentLoop } from "@/lib/agent/run-loop";
import { createRunId, savePendingSqlRun } from "@/lib/agent/pending-runs";

describe("runAgentLoop", () => {
  const originalLlmDisabled = process.env.LLM_DISABLED;
  const originalMaxSteps = process.env.AGENT_MAX_STEPS;

  afterEach(() => {
    if (originalLlmDisabled === undefined) {
      delete process.env.LLM_DISABLED;
    } else {
      process.env.LLM_DISABLED = originalLlmDisabled;
    }

    if (originalMaxSteps === undefined) {
      delete process.env.AGENT_MAX_STEPS;
    } else {
      process.env.AGENT_MAX_STEPS = originalMaxSteps;
    }
  });

  it("returns an error when LLM is disabled instead of using the rule planner", async () => {
    process.env.LLM_DISABLED = "1";

    const events = [];
    for await (const event of runAgentLoop("帮我查询车牌号为皖JV066M的车辆信息")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "error")).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(events.some((event) => event.type === "tool_call")).toBe(false);
    const error = events.find((event) => event.type === "error");
    expect(error?.type === "error" && error.message).toMatch(/LLM/);
  });

  it("cancels pending sql on resume", async () => {
    const runId = createRunId();
    await savePendingSqlRun({
      runId,
      message: "统计各状态的正式车源数量分布",
      prior: [],
      sql: "SELECT car_status, COUNT(*) AS cnt FROM `matador`.`car` WHERE test_type = 0 GROUP BY car_status LIMIT 50",
      explanation: "test",
      createdAt: Date.now(),
      userId: "unknown",
    });

    const resumeEvents = [];
    for await (const event of runAgentLoop("", {
      resume: { actionId: "cancel_sql", payload: { runId } },
    })) {
      resumeEvents.push(event);
    }

    const answer = resumeEvents.find((event) => event.type === "answer");
    expect(answer?.type).toBe("answer");
    if (answer?.type === "answer") {
      expect(answer.text).toContain("取消");
    }
    expect(resumeEvents.some((event) => event.type === "done")).toBe(true);
  });

  it("keeps pending and requeues when edited sql fails validation", async () => {
    const runId = createRunId();
    await savePendingSqlRun({
      runId,
      message: "大风车正式车源一共有多少辆？",
      prior: [],
      sql: "SELECT COUNT(*) AS car_count FROM `matador`.`car` WHERE test_type = 0",
      explanation: "test",
      createdAt: Date.now(),
      userId: "unknown",
    });

    const resumeEvents = [];
    for await (const event of runAgentLoop("", {
      resume: {
        actionId: "confirm_sql",
        payload: {
          runId,
          sql: "DROP TABLE car",
        },
      },
    })) {
      resumeEvents.push(event);
    }

    expect(resumeEvents.some((event) => event.type === "error")).toBe(true);
    expect(resumeEvents.some((event) => event.type === "awaiting_input")).toBe(
      true,
    );
    expect(resumeEvents.some((event) => event.type === "done")).toBe(false);

    const { peekPendingSqlRunForTest } = await import("@/lib/agent/run-loop");
    expect(await peekPendingSqlRunForTest(runId)).not.toBeNull();
  });

  it("emits done after terminal errors", async () => {
    const resumeEvents = [];
    for await (const event of runAgentLoop("", {
      resume: {
        actionId: "confirm_sql",
        payload: { runId: "run_missing" },
      },
    })) {
      resumeEvents.push(event);
    }

    expect(resumeEvents.some((event) => event.type === "error")).toBe(true);
    expect(resumeEvents.some((event) => event.type === "done")).toBe(true);
  });

  it("stops when the request is aborted", async () => {
    process.env.LLM_DISABLED = "1";

    const controller = new AbortController();
    const events = [];

    const loop = runAgentLoop("大风车正式车源一共有多少辆？", {
      signal: controller.signal,
    });

    controller.abort();

    await expect(async () => {
      for await (const event of loop) {
        events.push(event);
      }
    }).rejects.toThrow("Agent request aborted");
  });
});

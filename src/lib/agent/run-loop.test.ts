import { afterEach, describe, expect, it } from "vitest";

import { runAgentLoop } from "@/lib/agent/run-loop";

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

  it("lists schema for table catalog questions", async () => {
    process.env.LLM_DISABLED = "1";

    const events = [];
    for await (const event of runAgentLoop("列出分析库的表目录")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool_call")).toBe(true);
    const toolCall = events.find((event) => event.type === "tool_call");
    expect(toolCall?.type).toBe("tool_call");
    if (toolCall?.type === "tool_call") {
      expect(toolCall.tool).toBe("list_schema");
    }
  });

  it("pauses for SQL confirmation on analytics questions", async () => {
    process.env.LLM_DISABLED = "1";

    const events = [];
    for await (const event of runAgentLoop("大风车正式车源一共有多少辆？")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "awaiting_input")).toBe(true);
    expect(events.some((event) => event.type === "a2ui")).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(false);

    const awaiting = events.find((event) => event.type === "awaiting_input");
    expect(awaiting?.type).toBe("awaiting_input");
    if (awaiting?.type === "awaiting_input") {
      expect(awaiting.sql.toLowerCase()).toContain("select");
    }
  });

  it("cancels pending sql on resume", async () => {
    process.env.LLM_DISABLED = "1";

    const events = [];
    for await (const event of runAgentLoop("统计各状态的正式车源数量分布")) {
      events.push(event);
    }

    const awaiting = events.find((event) => event.type === "awaiting_input");
    expect(awaiting?.type).toBe("awaiting_input");
    if (awaiting?.type !== "awaiting_input") {
      return;
    }

    const resumeEvents = [];
    for await (const event of runAgentLoop("", {
      resume: { actionId: "cancel_sql", payload: { runId: awaiting.runId } },
    })) {
      resumeEvents.push(event);
    }

    const answer = resumeEvents.find((event) => event.type === "answer");
    expect(answer?.type).toBe("answer");
    if (answer?.type === "answer") {
      expect(answer.text).toContain("取消");
    }
  });

  it("synthesizes an answer when max steps are exhausted", async () => {
    process.env.LLM_DISABLED = "1";
    process.env.AGENT_MAX_STEPS = "1";

    const events = [];
    for await (const event of runAgentLoop("分析库有哪些核心表和字段？")) {
      events.push(event);
    }

    const answer = events.find((event) => event.type === "answer");
    expect(answer).toBeDefined();
    expect(answer?.type).toBe("answer");
    if (answer?.type === "answer") {
      expect(answer.text).toContain("已达最大步数（1）");
      expect(answer.text).toContain("list_schema:");
    }
    expect(events.filter((event) => event.type === "plan")).toHaveLength(1);
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

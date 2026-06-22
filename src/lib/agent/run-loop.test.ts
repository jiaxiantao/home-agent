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

  it("completes a time query with answer and done events", async () => {
    process.env.LLM_DISABLED = "1";

    const events = [];
    for await (const event of runAgentLoop("现在几点？")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool_call")).toBe(true);
    expect(events.some((event) => event.type === "answer")).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(true);
  });

  it("synthesizes an answer when max steps are exhausted", async () => {
    process.env.LLM_DISABLED = "1";
    process.env.AGENT_MAX_STEPS = "1";

    const events = [];
    for await (const event of runAgentLoop("帮我搜索笔记里关于前端架构的内容")) {
      events.push(event);
    }

    const answer = events.find((event) => event.type === "answer");
    expect(answer).toBeDefined();
    expect(answer?.type).toBe("answer");
    if (answer?.type === "answer") {
      expect(answer.text).toContain("已达最大步数（1）");
      expect(answer.text).toContain("search_notes:");
    }
    expect(events.filter((event) => event.type === "plan")).toHaveLength(1);
  });

  it("stops when the request is aborted", async () => {
    process.env.LLM_DISABLED = "1";

    const controller = new AbortController();
    const events = [];

    const loop = runAgentLoop("帮我搜索笔记里关于前端架构的内容", {
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

import { afterEach, describe, expect, it } from "vitest";

import { runAgentLoop } from "@/lib/agent/run-loop";

describe("runAgentLoop", () => {
  const original = process.env.LLM_DISABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LLM_DISABLED;
    } else {
      process.env.LLM_DISABLED = original;
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
});

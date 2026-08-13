import { afterEach, describe, expect, it } from "vitest";

import { describeLlmFailure } from "@/lib/llm-config";

describe("describeLlmFailure", () => {
  const originalDisabled = process.env.LLM_DISABLED;

  afterEach(() => {
    if (originalDisabled === undefined) {
      delete process.env.LLM_DISABLED;
    } else {
      process.env.LLM_DISABLED = originalDisabled;
    }
  });

  it("explains LLM_DISABLED", () => {
    process.env.LLM_DISABLED = "1";
    expect(describeLlmFailure()).toContain("LLM_DISABLED");
  });

  it("includes provider and error detail when a call fails", () => {
    delete process.env.LLM_DISABLED;
    const message = describeLlmFailure(new Error("ECONNREFUSED"), "ollama");
    expect(message).toContain("本地模型");
    expect(message).toContain("ECONNREFUSED");
  });
});

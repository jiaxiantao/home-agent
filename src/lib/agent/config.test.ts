import { afterEach, describe, expect, it } from "vitest";

import { getAgentMaxSteps } from "@/lib/agent/config";

describe("getAgentMaxSteps", () => {
  const original = process.env.AGENT_MAX_STEPS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AGENT_MAX_STEPS;
    } else {
      process.env.AGENT_MAX_STEPS = original;
    }
  });

  it("defaults to 10", () => {
    delete process.env.AGENT_MAX_STEPS;
    expect(getAgentMaxSteps()).toBe(10);
  });

  it("respects env within cap", () => {
    process.env.AGENT_MAX_STEPS = "10";
    expect(getAgentMaxSteps()).toBe(10);
  });

  it("caps at 12", () => {
    process.env.AGENT_MAX_STEPS = "99";
    expect(getAgentMaxSteps()).toBe(12);
  });

  it("falls back to default for invalid values", () => {
    process.env.AGENT_MAX_STEPS = "0";
    expect(getAgentMaxSteps()).toBe(10);

    process.env.AGENT_MAX_STEPS = "not-a-number";
    expect(getAgentMaxSteps()).toBe(10);
  });
});

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

  it("defaults to 4", () => {
    delete process.env.AGENT_MAX_STEPS;
    expect(getAgentMaxSteps()).toBe(4);
  });

  it("respects env within cap", () => {
    process.env.AGENT_MAX_STEPS = "6";
    expect(getAgentMaxSteps()).toBe(6);
  });

  it("caps at 12", () => {
    process.env.AGENT_MAX_STEPS = "99";
    expect(getAgentMaxSteps()).toBe(12);
  });
});

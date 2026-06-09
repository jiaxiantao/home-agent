import { describe, expect, it } from "vitest";

import { runAgentTool } from "@/lib/agent/tools";

describe("runAgentTool", () => {
  it("calculates safe expressions", async () => {
    const output = await runAgentTool("calculate", { expression: "(2 + 3) * 4" });
    expect(output).toBe("(2 + 3) * 4 = 20");
  });

  it("rejects invalid calculate input", async () => {
    await expect(runAgentTool("calculate", { expression: "abc" })).rejects.toThrow(
      "表达式无效或过长",
    );
  });

  it("returns server time", async () => {
    const output = await runAgentTool("current_time", {});
    expect(output.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import { runAgentTool } from "@/lib/agent/tools";

describe("runAgentTool", () => {
  it("proposes read-only sql", async () => {
    const result = await runAgentTool("propose_sql", {
      sql: "SELECT COUNT(*) AS c FROM car",
      explanation: "count cars",
    });
    expect(result.data).toMatchObject({
      sql: "SELECT COUNT(*) AS c FROM car",
      explanation: "count cars",
    });
  });

  it("rejects dangerous propose_sql", async () => {
    await expect(
      runAgentTool("propose_sql", { sql: "DELETE FROM car", explanation: "bad" }),
    ).rejects.toThrow(/只读校验/);
  });

  it("lists schema catalog", async () => {
    const result = await runAgentTool("list_schema", {});
    expect(result.output).toContain("car");
  });
});

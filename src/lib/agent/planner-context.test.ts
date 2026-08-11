import { describe, expect, it } from "vitest";

import { truncatePriorForPlanner } from "@/lib/agent/planner-context";

describe("truncatePriorForPlanner", () => {
  it("slims execute_sql row payloads", () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      id: index,
      name: `row-${index}-${"x".repeat(20)}`,
    }));

    const slimmed = truncatePriorForPlanner([
      {
        tool: "execute_sql",
        args: { sql: "SELECT * FROM car" },
        output: "ok",
        data: {
          sql: "SELECT * FROM car",
          columns: ["id", "name"],
          rows,
          rowCount: rows.length,
          truncated: false,
        },
      },
    ]);

    const data = slimmed[0]?.data as {
      rowsPreview: unknown[];
      rowsOmitted: number;
    };

    expect(data.rowsPreview).toHaveLength(8);
    expect(data.rowsOmitted).toBe(32);
  });

  it("truncates long tool output text", () => {
    const slimmed = truncatePriorForPlanner([
      {
        tool: "list_schema",
        args: {},
        output: "a".repeat(5000),
      },
    ]);

    expect(slimmed[0]?.output.length).toBeLessThan(1300);
    expect(slimmed[0]?.output).toContain("truncated");
  });
});

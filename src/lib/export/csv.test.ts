import { describe, expect, it } from "vitest";

import { buildCsv, escapeCsvCell } from "@/lib/export/csv";

describe("csv export", () => {
  it("escapes commas and quotes", () => {
    expect(escapeCsvCell('say "hi", world')).toBe('"say ""hi"", world"');
  });

  it("builds csv with header", () => {
    const csv = buildCsv(["a", "b"], [{ a: 1, b: "x" }]);
    expect(csv).toBe("a,b\n1,x");
  });
});

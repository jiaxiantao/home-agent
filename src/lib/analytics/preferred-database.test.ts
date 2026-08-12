import { describe, expect, it } from "vitest";

import { resolvePreferredOrDefaultDatabase } from "@/lib/analytics/preferred-database";

describe("preferred-database", () => {
  it("requires explicit or session database", () => {
    expect(() => resolvePreferredOrDefaultDatabase()).toThrow(/未指定数据库/);
  });

  it("accepts explicit database", () => {
    expect(resolvePreferredOrDefaultDatabase("super_mario")).toBe("super_mario");
  });
});

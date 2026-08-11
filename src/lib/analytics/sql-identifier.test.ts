import { describe, expect, it } from "vitest";

import { assertSqlIdentifier, quoteSqlIdentifier } from "@/lib/analytics/sql-identifier";

describe("assertSqlIdentifier", () => {
  it("accepts valid identifiers", () => {
    expect(assertSqlIdentifier("car")).toBe("car");
    expect(assertSqlIdentifier("main_order")).toBe("main_order");
    expect(assertSqlIdentifier("danube-activity-center")).toBe(
      "danube-activity-center",
    );
  });

  it("rejects injection-like names", () => {
    expect(() => assertSqlIdentifier("car; DROP TABLE car")).toThrow(/无效/);
    expect(() => assertSqlIdentifier("car`")).toThrow(/无效/);
    expect(() => assertSqlIdentifier("")).toThrow(/不能为空/);
  });

  it("quotes identifiers safely", () => {
    expect(quoteSqlIdentifier("matador")).toBe("`matador`");
  });
});

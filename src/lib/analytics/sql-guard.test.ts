import { describe, expect, it } from "vitest";

import { assertReadOnlySql, ensureLimit } from "@/lib/analytics/sql-guard";

describe("assertReadOnlySql", () => {
  it("allows select", () => {
    const result = assertReadOnlySql("SELECT COUNT(*) AS c FROM car WHERE test_type = 0");
    expect(result.ok).toBe(true);
  });

  it("rejects delete", () => {
    const result = assertReadOnlySql("DELETE FROM car");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/只读|危险/);
    }
  });

  it("rejects update", () => {
    const result = assertReadOnlySql("UPDATE car SET car_status = 1");
    expect(result.ok).toBe(false);
  });

  it("rejects multi statements", () => {
    const result = assertReadOnlySql("SELECT 1; DROP TABLE car");
    expect(result.ok).toBe(false);
  });

  it("allows trailing semicolon", () => {
    const result = assertReadOnlySql("SELECT 1;");
    expect(result.ok).toBe(true);
  });
});

describe("ensureLimit", () => {
  it("appends limit when missing", () => {
    expect(ensureLimit("SELECT * FROM car", 100)).toContain("LIMIT 100");
  });

  it("caps existing limit", () => {
    expect(ensureLimit("SELECT * FROM car LIMIT 9999", 500)).toBe(
      "SELECT * FROM car LIMIT 500",
    );
  });
});

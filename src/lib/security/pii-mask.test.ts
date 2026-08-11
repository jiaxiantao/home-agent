import { describe, expect, it } from "vitest";

import { maskQueryRows, isSensitiveColumn } from "@/lib/security/pii-mask";

describe("pii-mask", () => {
  it("detects sensitive columns", () => {
    expect(isSensitiveColumn("user_phone")).toBe(true);
    expect(isSensitiveColumn("car_status")).toBe(false);
  });

  it("masks sensitive values", () => {
    const rows = maskQueryRows(["user_phone", "cnt"], [{ user_phone: "13812345678", cnt: 3 }]);
    expect(String(rows[0]?.user_phone)).toContain("****");
    expect(rows[0]?.cnt).toBe(3);
  });
});

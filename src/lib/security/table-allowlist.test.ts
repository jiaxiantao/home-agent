import { describe, expect, it } from "vitest";

import {
  assertAllowedTables,
  extractReferencedTables,
} from "@/lib/security/table-allowlist";

describe("table allowlist", () => {
  it("extracts tables from select", () => {
    expect(extractReferencedTables("SELECT * FROM car JOIN car_extra ON car.car_id = car_extra.car_id")).toEqual([
      "car",
      "car_extra",
    ]);
  });

  it("allows all when allowlist unset", () => {
    const previous = process.env.ANALYTICS_MYSQL_TABLE_ALLOWLIST;
    delete process.env.ANALYTICS_MYSQL_TABLE_ALLOWLIST;

    expect(assertAllowedTables("SELECT * FROM secret_table").ok).toBe(true);

    if (previous) {
      process.env.ANALYTICS_MYSQL_TABLE_ALLOWLIST = previous;
    }
  });

  it("denies tables outside allowlist", () => {
    const previous = process.env.ANALYTICS_MYSQL_TABLE_ALLOWLIST;
    process.env.ANALYTICS_MYSQL_TABLE_ALLOWLIST = "car,main_order";

    const result = assertAllowedTables("SELECT * FROM car JOIN admin_users u ON 1=1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/admin_users/);
    }

    if (previous) {
      process.env.ANALYTICS_MYSQL_TABLE_ALLOWLIST = previous;
    } else {
      delete process.env.ANALYTICS_MYSQL_TABLE_ALLOWLIST;
    }
  });
});

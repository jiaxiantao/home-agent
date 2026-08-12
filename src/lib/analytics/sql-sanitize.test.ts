import { describe, expect, it } from "vitest";

import {
  fixSqlFromExecutionError,
  sanitizeAgentSql,
} from "@/lib/analytics/sql-sanitize";

describe("sanitizeAgentSql", () => {
  it("removes objCode from WHERE clause", () => {
    const input =
      "SELECT * FROM `super_mario`.`customer` WHERE id = 'ANwbnMyLF0' AND objCode = 'customer' LIMIT 20";
    const { sql, changed, notes } = sanitizeAgentSql(input);

    expect(changed).toBe(true);
    expect(sql).not.toMatch(/objCode/i);
    expect(sql).toContain("id = 'ANwbnMyLF0'");
    expect(notes.length).toBeGreaterThan(0);
  });

  it("maps recordId to id on customer table", () => {
    const input =
      "SELECT * FROM `super_mario`.`customer` WHERE recordId = 'abc' LIMIT 10";
    const { sql } = sanitizeAgentSql(input);

    expect(sql).toContain("id = 'abc'");
    expect(sql).not.toMatch(/recordId/i);
  });

  it("leaves valid sql unchanged", () => {
    const input =
      "SELECT id, phone FROM `super_mario`.`customer` WHERE id = 'ANwbnMyLF0' LIMIT 20";
    const { sql, changed } = sanitizeAgentSql(input);

    expect(changed).toBe(false);
    expect(sql).toBe(input);
  });
});

describe("fixSqlFromExecutionError", () => {
  it("fixes sql when mysql reports unknown objCode column", () => {
    const fixed = fixSqlFromExecutionError(
      "SELECT * FROM customer WHERE id = 'x' AND objCode = 'customer'",
      "Unknown column 'objCode' in 'where clause'",
    );

    expect(fixed?.changed).toBe(true);
    expect(fixed?.sql).not.toMatch(/objCode/i);
  });
});

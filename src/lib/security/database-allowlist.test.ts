import { afterEach, describe, expect, it } from "vitest";

import {
  assertAllowedDatabases,
  extractReferencedDatabases,
} from "@/lib/security/database-allowlist";

describe("database allowlist", () => {
  const previous = process.env.ANALYTICS_MYSQL_DATABASE_ALLOWLIST;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.ANALYTICS_MYSQL_DATABASE_ALLOWLIST;
    } else {
      process.env.ANALYTICS_MYSQL_DATABASE_ALLOWLIST = previous;
    }
  });

  it("extracts databases from qualified table refs", () => {
    expect(
      extractReferencedDatabases(
        "SELECT * FROM `danube_member`.user JOIN matador.car ON 1=1",
      ),
    ).toEqual(["danube_member", "matador"]);
  });

  it("denies databases outside allowlist", () => {
    process.env.ANALYTICS_MYSQL_DATABASE_ALLOWLIST = "matador,danube_member";
    const result = assertAllowedDatabases(
      "SELECT COUNT(*) FROM mysql.user",
    );
    expect(result.ok).toBe(false);
  });

  it("allows registry databases by default", () => {
    delete process.env.ANALYTICS_MYSQL_DATABASE_ALLOWLIST;
    const result = assertAllowedDatabases(
      "SELECT COUNT(*) FROM danube_member.member LIMIT 1",
    );
    expect(result.ok).toBe(true);
  });
});

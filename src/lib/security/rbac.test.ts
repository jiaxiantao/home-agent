import { describe, expect, it } from "vitest";

import { isToolAllowedForUser } from "@/lib/security/rbac";

describe("rbac", () => {
  it("restricts sample_table_rows to admin", () => {
    process.env.AUTH_ADMIN_USER_IDS = "admin1";
    expect(isToolAllowedForUser("sample_table_rows", "admin1")).toBe(true);
    expect(isToolAllowedForUser("sample_table_rows", "user2")).toBe(false);
    expect(isToolAllowedForUser("list_tables", "user2")).toBe(true);
  });
});

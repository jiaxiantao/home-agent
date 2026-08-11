import { describe, expect, it } from "vitest";

import { nlSqlGoldenCases } from "@/lib/agent/nl-sql-golden";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import { assertReadOnlySql } from "@/lib/analytics/sql-guard";

describe("NL→SQL golden cases (mock planner)", () => {
  for (const testCase of nlSqlGoldenCases) {
    it(testCase.id, () => {
      const plan = buildMockPlan(testCase.question, []);

      expect(plan.action).toBe(testCase.expect.action);

      if (testCase.expect.action === "tool") {
        expect(plan.action).toBe("tool");
        if (plan.action !== "tool") {
          return;
        }

        expect(plan.tool).toBe(testCase.expect.tool);

        if (testCase.expect.argsIncludes) {
          for (const [key, value] of Object.entries(testCase.expect.argsIncludes)) {
            expect(String(plan.args[key])).toBe(value);
          }
        }

        if (plan.tool === "propose_sql") {
          const sql = String(plan.args.sql ?? "");
          const guarded = assertReadOnlySql(sql);
          expect(guarded.ok).toBe(true);

          for (const fragment of testCase.expect.sqlIncludes ?? []) {
            expect(sql.toLowerCase()).toContain(fragment.toLowerCase());
          }

          for (const fragment of testCase.expect.sqlExcludes ?? []) {
            expect(sql.toUpperCase()).not.toContain(fragment.toUpperCase());
          }
        }
      }
    });
  }
});

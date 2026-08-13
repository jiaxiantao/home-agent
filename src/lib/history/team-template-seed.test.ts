import { describe, expect, it } from "vitest";

import { teamTemplateSeed, teamTemplateSeedCount } from "@/lib/history/team-template-catalog";

describe("team template seed", () => {
  it("has at least 100 curated prompts", () => {
    expect(teamTemplateSeedCount).toBeGreaterThanOrEqual(100);
  });

  it("has unique prompts", () => {
    const prompts = teamTemplateSeed.map((item) => item.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("labels and categories are non-empty", () => {
    for (const item of teamTemplateSeed) {
      expect(item.label.trim()).not.toBe("");
      expect(item.prompt.trim()).not.toBe("");
      expect(item.category.trim()).not.toBe("");
    }
  });

  it("uses business language instead of database jargon", () => {
    const jargon =
      /danube_|matador|super_mario|cheniu_user|marketing_scrm|souche_|suez|anduin|detect_business|topcars|库里有哪些表|表有哪些字段|表结构|test_type|date_delete|date_update|shop_code|\bLIMIT\b|\bIS NULL\b|\bCOUNT\s*\(/i;

    for (const item of teamTemplateSeed) {
      expect(item.prompt, `${item.category}/${item.label}`).not.toMatch(jargon);
      expect(item.label, `${item.category}/${item.label}`).not.toMatch(
        /danube_|matador|super_mario|topcars|suez|anduin|库表|表结构|buy_car|main_order|operate_report|car表/i,
      );
    }
  });
});

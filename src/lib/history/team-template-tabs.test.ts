import { describe, expect, it } from "vitest";

import type { TeamTemplate } from "@/lib/history/team-templates";
import {
  buildTeamTemplateCategoryTabs,
  catalogSeedAsTemplates,
  pickTopTemplateInCategory,
} from "@/lib/history/team-template-tabs";

function template(
  partial: Partial<TeamTemplate> & Pick<TeamTemplate, "id" | "label" | "prompt">,
): TeamTemplate {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "test",
    ...partial,
  };
}

describe("team template category tabs", () => {
  it("picks the most used prompt in a category", () => {
    const templates = [
      template({
        id: "a",
        label: "车牌",
        prompt: "我想知道车牌号为 皖JV066M 的车辆信息",
        category: "车源",
        useCount: 1,
      }),
      template({
        id: "b",
        label: "车源总数",
        prompt: "大风车正式车源一共有多少辆？",
        category: "车源",
        useCount: 9,
      }),
    ];

    expect(pickTopTemplateInCategory(templates, "车源")?.prompt).toBe(
      "大风车正式车源一共有多少辆？",
    );
  });

  it("falls back to seed order when usage is empty", () => {
    const tabs = buildTeamTemplateCategoryTabs({
      templates: catalogSeedAsTemplates(),
    });

    expect(tabs[0]?.category).toBe("车源");
    expect(tabs[0]?.prompt).toBe("我想知道车牌号为 皖JV066M 的车辆信息");

    const crm = tabs.find((item) => item.category === "客户CRM");
    expect(crm?.prompt).toBe("我想知道客户手机号为 13166990795 的客户信息");
  });

  it("respects category sortOrder over preferred names", () => {
    const tabs = buildTeamTemplateCategoryTabs({
      categories: [
        { name: "客户CRM", sortOrder: 1 },
        { name: "车源", sortOrder: 2 },
      ],
      templates: catalogSeedAsTemplates(),
    });

    expect(tabs.map((item) => item.category).slice(0, 2)).toEqual([
      "客户CRM",
      "车源",
    ]);
  });
});

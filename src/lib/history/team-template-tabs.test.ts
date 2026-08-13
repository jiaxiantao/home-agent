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

    expect(tabs).toHaveLength(6);
    expect(tabs[0]?.category).toBe("车源");
    expect(tabs[0]?.prompt).toBe("我想知道车牌号为 皖JV066M 的车辆信息");

    const crm = tabs.find((item) => item.category === "客户CRM");
    expect(crm?.prompt).toBe("我想知道客户手机号为 13166990795 的客户信息");
  });

  it("keeps only the six hottest categories", () => {
    const templates = [
      template({ id: "1", label: "a", prompt: "p1", category: "金融", useCount: 10 }),
      template({ id: "2", label: "b", prompt: "p2", category: "检测", useCount: 8 }),
      template({ id: "3", label: "c", prompt: "p3", category: "会员", useCount: 6 }),
      template({ id: "4", label: "d", prompt: "p4", category: "联盟", useCount: 5 }),
      template({ id: "5", label: "e", prompt: "p5", category: "B2B", useCount: 4 }),
      template({ id: "6", label: "f", prompt: "p6", category: "元数据", useCount: 3 }),
      template({ id: "7", label: "g", prompt: "p7", category: "车源", useCount: 2 }),
      template({ id: "8", label: "h", prompt: "p8", category: "客户CRM", useCount: 1 }),
    ];

    const tabs = buildTeamTemplateCategoryTabs({ templates });
    expect(tabs.map((item) => item.category)).toEqual([
      "金融",
      "检测",
      "会员",
      "联盟",
      "B2B",
      "元数据",
    ]);
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

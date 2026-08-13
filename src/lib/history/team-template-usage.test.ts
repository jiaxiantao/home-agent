import { afterEach, describe, expect, it } from "vitest";

import {
  clearTeamTemplateUsageForTest,
  getTeamTemplateUsageMap,
  recordTeamTemplateUse,
} from "@/lib/history/team-template-usage";
import {
  clearTeamTemplateCategoriesForTest,
  createTeamTemplateCategory,
} from "@/lib/history/team-template-categories";
import {
  clearTeamTemplatesForTest,
  createTeamTemplate,
  listTeamTemplates,
  listTeamTemplatesPage,
} from "@/lib/history/team-templates";

describe("team template usage", () => {
  afterEach(() => {
    clearTeamTemplatesForTest();
    clearTeamTemplateUsageForTest();
    clearTeamTemplateCategoriesForTest();
  });

  it("sorts templates by popularity", async () => {
    clearTeamTemplatesForTest();
    const hot = await createTeamTemplate({
      label: "热门",
      prompt: "热门问法",
      createdBy: "admin1",
    });
    const cold = await createTeamTemplate({
      label: "冷门",
      prompt: "冷门问法",
      createdBy: "admin1",
    });

    await recordTeamTemplateUse(hot.id);
    await recordTeamTemplateUse(hot.id);
    await recordTeamTemplateUse(cold.id);

    const listed = await listTeamTemplates({ sort: "popular" });
    expect(listed[0]?.id).toBe(hot.id);
    expect(listed[0]?.useCount).toBe(2);
    expect(listed[1]?.id).toBe(cold.id);
  });

  it("tracks usage counts in memory", async () => {
    await recordTeamTemplateUse("tpl_builtin_demo");
    await recordTeamTemplateUse("tpl_builtin_demo");

    const usage = await getTeamTemplateUsageMap();
    expect(usage.get("tpl_builtin_demo")?.useCount).toBe(2);
  });

  it("paginates templates with search", async () => {
    clearTeamTemplatesForTest();
    clearTeamTemplateCategoriesForTest();
    await createTeamTemplateCategory({ name: "金融" });
    await createTeamTemplateCategory({ name: "车源" });
    await createTeamTemplate({
      label: "放款合计",
      prompt: "统计本月放款金额合计",
      createdBy: "admin1",
      category: "金融",
    });
    await createTeamTemplate({
      label: "车源统计",
      prompt: "正式车源一共有多少辆",
      createdBy: "admin1",
      category: "车源",
    });

    const page1 = await listTeamTemplatesPage({
      page: 1,
      pageSize: 1,
      sort: "popular",
    });
    expect(page1.total).toBeGreaterThanOrEqual(2);
    expect(page1.items).toHaveLength(1);

    const filtered = await listTeamTemplatesPage({
      q: "放款",
      category: "金融",
      sort: "popular",
    });
    expect(filtered.items.some((item) => item.label === "放款合计")).toBe(true);
    expect(filtered.items.every((item) => item.category === "金融")).toBe(true);
  });
});

import { afterEach, describe, expect, it } from "vitest";

import {
  clearTeamTemplateCategoriesForTest,
  createTeamTemplateCategory,
  deleteTeamTemplateCategory,
  listTeamTemplateCategories,
  updateTeamTemplateCategory,
} from "@/lib/history/team-template-categories";
import {
  clearTeamTemplatesForTest,
  createTeamTemplate,
} from "@/lib/history/team-templates";

describe("team template categories", () => {
  afterEach(() => {
    clearTeamTemplateCategoriesForTest();
    clearTeamTemplatesForTest();
  });

  it("creates and lists categories", async () => {
    clearTeamTemplateCategoriesForTest();
    await createTeamTemplateCategory({ name: "金融", description: "贷款相关" });
    const listed = await listTeamTemplateCategories();
    expect(listed.some((item) => item.name === "金融")).toBe(true);
  });

  it("dedupes category names", async () => {
    clearTeamTemplateCategoriesForTest();
    await createTeamTemplateCategory({ name: "CRM" });
    await expect(createTeamTemplateCategory({ name: "CRM" })).rejects.toThrow(
      "分类名称已存在",
    );
  });

  it("blocks delete when templates exist in mysql-less memory mode", async () => {
    clearTeamTemplateCategoriesForTest();
    clearTeamTemplatesForTest();
    const category = await createTeamTemplateCategory({ name: "测试分类" });
    await createTeamTemplate({
      label: "样例",
      prompt: "测试问法",
      createdBy: "admin1",
      category: "测试分类",
    });

    await expect(deleteTeamTemplateCategory(category.id)).rejects.toThrow(
      "无法删除",
    );
  });

  it("updates category name", async () => {
    clearTeamTemplateCategoriesForTest();
    const created = await createTeamTemplateCategory({ name: "旧分类" });
    const updated = await updateTeamTemplateCategory(created.id, {
      name: "新分类",
    });
    expect(updated?.name).toBe("新分类");
  });

  it("keeps 我的收藏 as a protected category", async () => {
    clearTeamTemplateCategoriesForTest();
    const listed = await listTeamTemplateCategories();
    const favorite = listed.find((item) => item.name === "我的收藏");
    expect(favorite?.protected).toBe(true);

    await expect(
      createTeamTemplateCategory({ name: "我的收藏" }),
    ).rejects.toThrow("固定分类");
    await expect(deleteTeamTemplateCategory(favorite!.id)).rejects.toThrow(
      "无法删除",
    );
    await expect(
      updateTeamTemplateCategory(favorite!.id, { name: "别的名字" }),
    ).rejects.toThrow("无法改名");
  });
});

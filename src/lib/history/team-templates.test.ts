import { afterEach, describe, expect, it } from "vitest";

import { clearTeamTemplateCategoriesForTest } from "@/lib/history/team-template-categories";
import {
  clearTeamTemplatesForTest,
  createTeamTemplate,
  deleteTeamTemplate,
  listTeamTemplates,
  listTeamTemplatesPage,
  toggleTeamTemplateFavorite,
} from "@/lib/history/team-templates";

describe("team templates", () => {
  afterEach(() => {
    clearTeamTemplatesForTest();
    clearTeamTemplateCategoriesForTest();
  });

  it("lists builtins and custom templates", async () => {
    clearTeamTemplatesForTest();
    const before = await listTeamTemplates();
    expect(before.some((item) => item.builtin)).toBe(true);

    const created = await createTeamTemplate({
      label: "周报口径",
      prompt: "按城市统计本周正式车源新增量",
      createdBy: "admin1",
    });

    expect(created.builtin).toBeUndefined();
    const listed = await listTeamTemplates();
    expect(listed[0]?.id).toBe(created.id);
  });

  it("dedupes by prompt and blocks deleting builtins", async () => {
    clearTeamTemplatesForTest();
    const first = await createTeamTemplate({
      label: "A",
      prompt: "同一问法",
      createdBy: "admin1",
    });
    const second = await createTeamTemplate({
      label: "B",
      prompt: "同一问法",
      createdBy: "admin1",
    });
    expect(second.id).toBe(first.id);
    expect(first.id).toHaveLength(16);

    const builtins = (await listTeamTemplates()).filter((item) => item.builtin);
    expect(await deleteTeamTemplate(builtins[0]!.id)).toBe(false);
    expect(await deleteTeamTemplate(first.id)).toBe(true);
  });

  it("copies a template into the viewer's 我的收藏", async () => {
    const created = await createTeamTemplate({
      label: "周报口径",
      prompt: "按城市统计本周正式车源新增量-收藏",
      createdBy: "admin1",
    });

    const favorited = await toggleTeamTemplateFavorite("u1", created.id);
    expect(favorited.favorited).toBe(true);
    expect(favorited.template?.category).toBe("我的收藏");
    expect(favorited.template?.createdBy).toBe("u1");

    const mine = await listTeamTemplatesPage({
      category: "我的收藏",
      viewerUserId: "u1",
    });
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]?.prompt).toBe(created.prompt);

    const other = await listTeamTemplatesPage({
      category: "我的收藏",
      viewerUserId: "u2",
    });
    expect(other.items).toHaveLength(0);

    const all = await listTeamTemplatesPage({ viewerUserId: "u1" });
    expect(
      all.items.some((item) => item.id === created.id && item.favorited),
    ).toBe(true);
    expect(all.items.some((item) => item.category === "我的收藏")).toBe(false);

    const again = await toggleTeamTemplateFavorite("u1", created.id);
    expect(again.favorited).toBe(false);
    const mineAfter = await listTeamTemplatesPage({
      category: "我的收藏",
      viewerUserId: "u1",
    });
    expect(mineAfter.items).toHaveLength(0);
  });

  it("does not allow creating templates directly under 我的收藏", async () => {
    await expect(
      createTeamTemplate({
        label: "非法收藏",
        prompt: "不能直接新建到我的收藏",
        createdBy: "admin1",
        category: "我的收藏",
      }),
    ).rejects.toThrow("收藏");
  });
});

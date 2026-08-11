import { afterEach, describe, expect, it } from "vitest";

import {
  clearTeamTemplatesForTest,
  createTeamTemplate,
  deleteTeamTemplate,
  listTeamTemplates,
} from "@/lib/history/team-templates";

describe("team templates", () => {
  afterEach(() => {
    clearTeamTemplatesForTest();
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

    const builtins = (await listTeamTemplates()).filter((item) => item.builtin);
    expect(await deleteTeamTemplate(builtins[0]!.id)).toBe(false);
    expect(await deleteTeamTemplate(first.id)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  createStableTeamTemplateId,
  createTeamTemplateId,
  isRandomTeamTemplateId,
} from "@/lib/history/team-template-id";

describe("team template id", () => {
  it("creates random 16-char ids", () => {
    const id = createTeamTemplateId();
    expect(id).toHaveLength(16);
    expect(isRandomTeamTemplateId(id)).toBe(true);
    expect(createTeamTemplateId()).not.toBe(id);
  });

  it("creates stable ids from seed", () => {
    expect(createStableTeamTemplateId("builtin:demo")).toBe(
      createStableTeamTemplateId("builtin:demo"),
    );
    expect(createStableTeamTemplateId("builtin:demo")).toHaveLength(16);
  });
});

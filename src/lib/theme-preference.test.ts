import { describe, expect, it } from "vitest";

import {
  DEFAULT_COLOR_THEME,
  parseColorTheme,
} from "@/lib/theme-preference";

describe("theme preference", () => {
  it("defaults to light", () => {
    expect(DEFAULT_COLOR_THEME).toBe("light");
    expect(parseColorTheme(null)).toBeNull();
    expect(parseColorTheme("system")).toBeNull();
  });

  it("accepts light and dark", () => {
    expect(parseColorTheme("light")).toBe("light");
    expect(parseColorTheme("dark")).toBe("dark");
  });
});

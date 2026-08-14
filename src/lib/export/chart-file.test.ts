import { describe, expect, it } from "vitest";

import { chartDownloadBasename } from "@/lib/export/chart-file";

describe("chart download filename", () => {
  it("sanitizes title for local files", () => {
    expect(chartDownloadBasename('查询结果: 售价/区间', "柱状图")).toBe(
      "查询结果-售价-区间",
    );
  });

  it("falls back to chart type label", () => {
    expect(chartDownloadBasename("  ", "K线图")).toBe("K线图");
  });
});

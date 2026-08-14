import { describe, expect, it } from "vitest";

import { buildChartSpecFromRows } from "@/lib/analytics/chart-spec";

describe("buildChartSpecFromRows", () => {
  it("skips single-row metric results", () => {
    const chart = buildChartSpecFromRows(
      ["min_price_yuan", "max_price_yuan", "avg_price_yuan", "total_cnt"],
      [
        {
          min_price_yuan: "0.01",
          max_price_yuan: "9999900",
          avg_price_yuan: "362583",
          total_cnt: 4081,
        },
      ],
      { preferredType: "bar" },
    );
    expect(chart).toBeNull();
  });

  it("builds a bar chart from category and numeric columns", () => {
    const chart = buildChartSpecFromRows(
      ["price_band", "cnt"],
      [
        { price_band: "5万以下", cnt: 10 },
        { price_band: "5-10万", cnt: 20 },
        { price_band: "10万以上", cnt: 8 },
      ],
      { preferredType: "bar", title: "售价区间" },
    );
    expect(chart).toMatchObject({
      type: "bar",
      xKey: "price_band",
      yKey: "cnt",
      title: "售价区间",
    });
  });
});

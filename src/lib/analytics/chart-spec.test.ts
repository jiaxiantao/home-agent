import { describe, expect, it } from "vitest";

import { buildChartSpecFromRows, parseChartType } from "@/lib/analytics/chart-spec";
import { CHART_TYPES } from "@/lib/analytics/chart-types";

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

  it("builds a funnel chart from staged conversion rows", () => {
    const chart = buildChartSpecFromRows(
      ["stage", "cnt"],
      [
        { stage: "正式车源", cnt: 4195 },
        { stage: "求购线索", cnt: 0 },
        { stage: "主订单", cnt: 6 },
      ],
      { preferredType: "funnel", title: "转化漏斗" },
    );
    expect(chart).toMatchObject({
      type: "funnel",
      xKey: "stage",
      yKey: "cnt",
      title: "转化漏斗",
    });
  });

  it("builds a gauge from a single-row metric", () => {
    const chart = buildChartSpecFromRows(
      ["total_cnt"],
      [{ total_cnt: 4081 }],
      { preferredType: "gauge", title: "车源总量" },
    );
    expect(chart).toMatchObject({
      type: "gauge",
      xKey: "name",
      yKey: "value",
      data: [{ name: "total_cnt", value: 4081 }],
    });
  });

  it("builds a scatter chart from two numeric columns", () => {
    const chart = buildChartSpecFromRows(
      ["cars", "orders"],
      [
        { cars: 10, orders: 2 },
        { cars: 20, orders: 5 },
      ],
      { preferredType: "scatter" },
    );
    expect(chart).toMatchObject({
      type: "scatter",
      xKey: "cars",
      yKey: "orders",
    });
  });

  it("builds a candlestick chart from OHLC columns", () => {
    const chart = buildChartSpecFromRows(
      ["dt", "open", "high", "low", "close"],
      [
        { dt: "2026-08-01", open: 10, high: 12, low: 9, close: 11 },
        { dt: "2026-08-02", open: 11, high: 13, low: 10, close: 10 },
      ],
      { preferredType: "candlestick" },
    );
    expect(chart).toMatchObject({
      type: "candlestick",
      xKey: "dt",
      openKey: "open",
      highKey: "high",
      lowKey: "low",
      closeKey: "close",
    });
  });

  it("builds a sankey chart from source/target/value", () => {
    const chart = buildChartSpecFromRows(
      ["source", "target", "cnt"],
      [
        { source: "广告", target: "成交", cnt: 12 },
        { source: "转介绍", target: "跟进", cnt: 8 },
      ],
      { preferredType: "sankey" },
    );
    expect(chart).toMatchObject({
      type: "sankey",
      sourceKey: "source",
      targetKey: "target",
      yKey: "cnt",
    });
  });

  it("builds a heatmap from two categories and a value", () => {
    const chart = buildChartSpecFromRows(
      ["city", "brand", "cnt"],
      [
        { city: "杭州", brand: "大众", cnt: 10 },
        { city: "杭州", brand: "丰田", cnt: 4 },
        { city: "成都", brand: "大众", cnt: 6 },
      ],
      { preferredType: "heatmap" },
    );
    expect(chart).toMatchObject({
      type: "heatmap",
      xKey: "city",
      yKey: "brand",
      zKey: "cnt",
    });
  });

  it("builds a pie chart when the dimension column has numeric codes", () => {
    const chart = buildChartSpecFromRows(
      ["状态", "车源数量"],
      [
        { 状态: 6, 车源数量: 3234 },
        { 状态: 8, 车源数量: 557 },
        { 状态: 9, 车源数量: 152 },
      ],
      { preferredType: "pie", title: "查询结果" },
    );
    expect(chart).toMatchObject({
      type: "pie",
      xKey: "状态",
      yKey: "车源数量",
      title: "查询结果",
    });
  });
});

describe("parseChartType", () => {
  it("covers at least 20 chart types and aliases", () => {
    expect(CHART_TYPES.length).toBeGreaterThanOrEqual(20);
    expect(parseChartType("kline")).toBe("candlestick");
    expect(parseChartType("donut")).toBe("doughnut");
    expect(parseChartType("K线图")).toBe("candlestick");
  });
});


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

  it("builds a funnel chart from staged conversion rows", () => {
    const chart = buildChartSpecFromRows(
      ["stage", "cnt"],
      [
        { stage: "正式车源", cnt: 4195 },
        { stage: "求购线索", cnt: 0 },
        { stage: "主订单", cnt: 6 },
      ],
      { preferredType: "funnel", title: "转化漏斗" },
    );
    expect(chart).toMatchObject({
      type: "funnel",
      xKey: "stage",
      yKey: "cnt",
      title: "转化漏斗",
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  inferPreferredChartType,
  userRequestedChart,
} from "@/lib/agent/chart-intent";

describe("userRequestedChart", () => {
  it("returns true when user explicitly asks for a chart", () => {
    expect(userRequestedChart("各状态车源数量，用柱状图展示")).toBe(true);
    expect(userRequestedChart("帮我生成统计图")).toBe(true);
    expect(userRequestedChart("show a bar chart by city")).toBe(true);
    expect(userRequestedChart("对比车源、求购、订单，生成漏斗图")).toBe(true);
    expect(userRequestedChart("看转化漏斗")).toBe(true);
  });

  it("returns false for plain data queries", () => {
    expect(userRequestedChart("我想知道客户 id 为 ANwbnMyLF0 的客户信息")).toBe(
      false,
    );
    expect(userRequestedChart("大风车正式车源一共有多少辆？")).toBe(false);
    expect(userRequestedChart("统计各状态的正式车源数量分布")).toBe(false);
  });

  it("infers preferred chart type from the question", () => {
    expect(inferPreferredChartType("用柱状图展示售价区间")).toBe("bar");
    expect(inferPreferredChartType("最近 7 天成交画折线图")).toBe("line");
    expect(inferPreferredChartType("按状态用饼图展示")).toBe("pie");
    expect(inferPreferredChartType("对比车源求购订单，生成漏斗图")).toBe("funnel");
    expect(inferPreferredChartType("看转化漏斗，用柱状图展示")).toBe("bar");
  });
});

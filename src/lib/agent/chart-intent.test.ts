import { describe, expect, it } from "vitest";

import { userRequestedChart } from "@/lib/agent/chart-intent";

describe("userRequestedChart", () => {
  it("returns true when user explicitly asks for a chart", () => {
    expect(userRequestedChart("各状态车源数量，用柱状图展示")).toBe(true);
    expect(userRequestedChart("帮我生成统计图")).toBe(true);
    expect(userRequestedChart("show a bar chart by city")).toBe(true);
  });

  it("returns false for plain data queries", () => {
    expect(userRequestedChart("我想知道客户 id 为 ANwbnMyLF0 的客户信息")).toBe(
      false,
    );
    expect(userRequestedChart("大风车正式车源一共有多少辆？")).toBe(false);
    expect(userRequestedChart("统计各状态的正式车源数量分布")).toBe(false);
  });
});

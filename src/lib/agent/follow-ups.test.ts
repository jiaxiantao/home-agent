import { describe, expect, it } from "vitest";

import { buildRuleFollowUps } from "@/lib/agent/follow-ups";

describe("buildRuleFollowUps", () => {
  it("suggests customer follow-ups for CRM answers", () => {
    const followUps = buildRuleFollowUps({
      message: "客户 id 为 ANwbnMyLF0 的客户信息",
      answer: "客户等级 H，处于新建阶段，有购车意向。",
    });
    expect(followUps[0]).toMatch(/跟进|意向|同店/);
    expect(followUps.length).toBeGreaterThanOrEqual(2);
  });

  it("suggests city breakdown for car inventory questions", () => {
    const followUps = buildRuleFollowUps({
      message: "正式车源一共有多少辆",
      answer: "正式车源共 12345 辆。",
    });
    expect(followUps.some((item) => item.includes("城市"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  extractQuestionSearchTerms,
  rankDatabasesForQuestion,
} from "@/lib/analytics/question-router";

describe("rankDatabasesForQuestion", () => {
  it("routes membership questions to danube_member", () => {
    const ranked = rankDatabasesForQuestion("会员中心有多少注册用户？");
    expect(ranked[0]?.database).toBe("danube_member");
  });

  it("routes car inventory questions to matador", () => {
    const ranked = rankDatabasesForQuestion("大风车正式车源一共有多少辆？");
    expect(ranked[0]?.database).toBe("matador");
  });

  it("routes finance questions to danube_mammon", () => {
    const ranked = rankDatabasesForQuestion("贷款放款订单有多少？");
    expect(ranked[0]?.database).toBe("danube_mammon");
  });

  it("boosts explicit database names in the question", () => {
    const ranked = rankDatabasesForQuestion("danube_topcars 里车源表结构怎样？");
    expect(ranked[0]?.database).toBe("danube_topcars");
  });
});

describe("extractQuestionSearchTerms", () => {
  it("includes rule search terms and latin identifiers", () => {
    const terms = extractQuestionSearchTerms("会员 member_user 表有多少行");
    expect(terms).toEqual(expect.arrayContaining(["member", "user", "vip"]));
    expect(terms.some((term) => term.includes("member_user"))).toBe(true);
  });
});

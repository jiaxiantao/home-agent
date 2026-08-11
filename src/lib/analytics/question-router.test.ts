import { describe, expect, it } from "vitest";

import {
  extractLookupId,
  extractQuestionSearchTerms,
  rankDatabasesForQuestion,
  suggestedTablesForQuestion,
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

describe("customer / user lookup routing", () => {
  it("routes customer id questions to matador", () => {
    const ranked = rankDatabasesForQuestion(
      "我想知道客户 id 为 demo_user_001 的用户信息",
    );
    expect(ranked[0]?.database).toBe("matador");
  });

  it("extracts lookup id and suggests cheniu_user", () => {
    expect(extractLookupId("我想知道客户 id 为 demo_user_001 的用户信息")).toBe(
      "demo_user_001",
    );
    expect(suggestedTablesForQuestion("客户 id 为 xxx 的用户信息")[0]).toMatchObject({
      database: "matador",
      table: "cheniu_user",
    });
  });
});

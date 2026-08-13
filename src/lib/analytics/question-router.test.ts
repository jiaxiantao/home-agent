import { describe, expect, it } from "vitest";

import {
  extractLicensePlate,
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

  it("does not default ambiguous questions to matador", () => {
    const ranked = rankDatabasesForQuestion("帮我看一下整体情况");
    expect(ranked.length).toBe(0);
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
  it("routes user id questions to matador cheniu_user", () => {
    const ranked = rankDatabasesForQuestion(
      "我想知道用户 id 为 demo_user_001 的用户信息",
    );
    expect(ranked[0]?.database).toBe("matador");
  });

  it("routes CRM customer management to super_mario", () => {
    const ranked = rankDatabasesForQuestion("客户管理跟进记录有多少？");
    expect(ranked[0]?.database).toBe("super_mario");
  });

  it("extracts lookup id and suggests matador cheniu_user for user info", () => {
    expect(extractLookupId("我想知道用户 id 为 demo_user_001 的用户信息")).toBe(
      "demo_user_001",
    );
    expect(suggestedTablesForQuestion("用户 id 为 xxx 的用户信息")[0]).toMatchObject({
      database: "matador",
      table: "cheniu_user",
    });
  });

  it("suggests CRM customer for phone lookup", () => {
    expect(suggestedTablesForQuestion("我想知道客户手机号为 13166990795 的客户信息")[0]).toMatchObject({
      database: "super_mario",
      table: "customer",
    });
  });

  it("suggests both CRM and user tables for ambiguous 客户 id", () => {
    const tables = suggestedTablesForQuestion("客户 id 为 xxx 的信息");
    expect(tables.some((t) => t.database === "super_mario")).toBe(true);
    expect(tables.some((t) => t.database === "matador")).toBe(true);
  });
});

describe("plate lookup routing", () => {
  it("extracts mainland license plates", () => {
    expect(extractLicensePlate("查询车牌号为皖JV066M的车辆信息")).toBe("皖JV066M");
    expect(extractLicensePlate("帮我查一下浙A12345")).toBe("浙A12345");
  });

  it("routes plate questions to matador.car", () => {
    const q = "查询车牌号为皖JV066M的车辆信息";
    expect(rankDatabasesForQuestion(q)[0]?.database).toBe("matador");
    expect(suggestedTablesForQuestion(q)[0]).toMatchObject({
      database: "matador",
      table: "car",
    });
    expect(extractQuestionSearchTerms(q)).toEqual(
      expect.arrayContaining(["license_number", "plate", "car"]),
    );
  });
});

describe("extended DFC database routing", () => {
  it("routes SCRM questions to marketing_scrm", () => {
    const ranked = rankDatabasesForQuestion("SCRM 私域客户有多少？");
    expect(ranked[0]?.database).toBe("marketing_scrm");
  });

  it("routes lead distribution to maple_story", () => {
    const ranked = rankDatabasesForQuestion("线索分发池今日新增多少？");
    expect(ranked[0]?.database).toBe("maple_story");
  });

  it("routes customer management to super_mario", () => {
    const ranked = rankDatabasesForQuestion("客户管理跟进记录统计");
    expect(ranked[0]?.database).toBe("super_mario");
  });
});

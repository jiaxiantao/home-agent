import { describe, expect, it } from "vitest";

import {
  DFC_DATABASE_COUNT,
  dfcProjectDatabaseRegistry,
  getRegistryDatabaseNames,
  matchRegistryKeywords,
} from "@/lib/analytics/project-databases";

describe("dfcProjectDatabaseRegistry", () => {
  it("registers all 42 DFC DBHub sources", () => {
    expect(dfcProjectDatabaseRegistry).toHaveLength(DFC_DATABASE_COUNT);
    expect(getRegistryDatabaseNames()).toHaveLength(DFC_DATABASE_COUNT);
  });

  it("has unique database names", () => {
    const names = getRegistryDatabaseNames();
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes core danube and matador libraries", () => {
    const names = new Set(getRegistryDatabaseNames());
    expect(names.has("matador")).toBe(true);
    expect(names.has("danube_member")).toBe(true);
    expect(names.has("cheniu_user")).toBe(true);
    expect(names.has("super_mario")).toBe(true);
  });
});

describe("matchRegistryKeywords", () => {
  it("matches SCRM questions to marketing_scrm", () => {
    const matches = matchRegistryKeywords("SCRM 客户标签分布怎样？");
    expect(matches.some((item) => item.database === "marketing_scrm")).toBe(true);
  });

  it("matches enterprise wechat to anduin", () => {
    const matches = matchRegistryKeywords("企业微信部门同步情况");
    expect(matches.some((item) => item.database === "anduin")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  dfcBusinessEntities,
  matchBusinessEntities,
} from "@/lib/analytics/business-glossary";

describe("dfcBusinessEntities", () => {
  it("defines core disambiguation entities", () => {
    const databases = new Set(dfcBusinessEntities.map((e) => e.database));
    expect(databases.has("matador")).toBe(true);
    expect(databases.has("super_mario")).toBe(true);
    expect(databases.has("danube_member")).toBe(true);
  });
});

describe("matchBusinessEntities", () => {
  it("maps user questions to matador.cheniu_user", () => {
    const hits = matchBusinessEntities("车牛用户 dfc_user_id 查询");
    expect(hits.some((h) => h.table === "cheniu_user")).toBe(true);
  });

  it("maps CRM questions to super_mario.customer", () => {
    const hits = matchBusinessEntities("客户管理跟进记录统计");
    expect(hits.some((h) => h.database === "super_mario")).toBe(true);
  });

  it("maps membership questions to danube_member", () => {
    const hits = matchBusinessEntities("会员中心 VIP 用户");
    expect(hits.some((h) => h.database === "danube_member")).toBe(true);
  });

  it("maps plate questions to matador.car", () => {
    const hits = matchBusinessEntities("查询车牌号为皖JV066M的车辆信息");
    expect(hits.some((h) => h.database === "matador" && h.table === "car")).toBe(true);
  });
});

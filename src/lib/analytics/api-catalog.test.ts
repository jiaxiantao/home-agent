import { describe, expect, it, beforeAll, afterAll } from "vitest";

import {
  extractApiParams,
  extractPhoneFromQuestion,
  extractWechatFromQuestion,
  isApiFirstQuestion,
  pickBestApiForQuestion,
  rankApisForQuestion,
} from "@/lib/analytics/api-catalog";
import {
  resetDfcApiCatalogCache,
  setDfcApiCatalogCache,
} from "@/lib/analytics/api-catalog-store";
import { loadDfcApiCatalogFromJsonFile } from "@/lib/analytics/dfc-api-catalog-json";

describe("api-catalog", () => {
  beforeAll(() => {
    try {
      const endpoints = loadDfcApiCatalogFromJsonFile();
      setDfcApiCatalogCache(endpoints, { total: endpoints.length });
    } catch {
      setDfcApiCatalogCache([], { total: 0 });
    }
  });

  afterAll(() => {
    resetDfcApiCatalogCache();
  });
  it("extracts phone from natural language", () => {
    expect(extractPhoneFromQuestion("查询客户手机号为16612341112的客户信息")).toBe(
      "16612341112",
    );
    expect(
      extractPhoneFromQuestion("我想知道客户手机号为 13166990795 的客户信息"),
    ).toBe("13166990795");
  });

  it("prefers CRM API for customer phone lookup", () => {
    const best = pickBestApiForQuestion(
      "我想知道客户手机号为 13166990795 的客户信息",
    );
    expect(best?.endpoint.appCode).toBe("super-mario");
    expect(best?.endpoint.methodName).toBe("queryCustomerDetailsByContact");
    expect(best?.extractedParams.phone).toBe("13166990795");
    expect(isApiFirstQuestion("我想知道客户手机号为 13166990795 的客户信息")).toBe(
      true,
    );
  });

  it("prefers cheniu user API for 车牛用户", () => {
    const best = pickBestApiForQuestion("查车牛用户手机号13800138000的资料");
    expect(best?.endpoint.entity).toBe("cheniu_user");
  });

  it("prefers CRM contact API for wechat lookup", () => {
    expect(extractWechatFromQuestion("客户微信号为 wxid_demo001 的信息")).toBe(
      "wxid_demo001",
    );
    const best = pickBestApiForQuestion("我想知道客户微信号为 wxid_demo001 的客户信息");
    expect(best?.endpoint.methodName).toBe("queryCustomerDetailsByContact");
    expect(best?.extractedParams.phone).toBe("wxid_demo001");
    expect(best?.extractedParams.wechat).toBe("wxid_demo001");
  });

  it("prefers CRM crmQueryCustomerInfo for customer recordId", () => {
    const q = "我想知道客户 id 为 ANWbnMyLF0 的客户信息";
    const best = pickBestApiForQuestion(q);
    expect(best?.endpoint.methodName).toBe("crmQueryCustomerInfo");
    expect(best?.endpoint.http?.path).toContain("crmQueryCustomerInfo");
    expect(best?.extractedParams.recordId).toBe("ANWbnMyLF0");
    expect(isApiFirstQuestion(q)).toBe(true);
  });

  it("marks aggregate questions as not lookup-shaped (planner still searches APIs first)", () => {
    expect(isApiFirstQuestion("统计正式车源有多少")).toBe(false);
  });

  it("routes plate lookup to kartrider queryRecordPageInfo first", () => {
    const q = "查询车牌号为皖JV066M的车辆信息";
    expect(extractApiParams(q).objCode).toBeUndefined();
    expect(extractApiParams(q).plate).toBe("皖JV066M");
    const best = pickBestApiForQuestion(q);
    expect(best?.endpoint.methodName).toBe("queryRecordPageInfo");
    expect(best?.endpoint.appCode).toBe("crazyracing-kartrider");
    expect(best?.endpoint.http?.path).toContain("queryRecordPageInfo");
    expect(best?.httpCallable).toBe(true);
    expect(isApiFirstQuestion(q)).toBe(true);
  });

  it("ranks multiple candidates for member phone", () => {
    const ranked = rankApisForQuestion("会员手机号15912345678的权益");
    expect(ranked.some((item) => item.endpoint.entity === "member")).toBe(true);
  });
});

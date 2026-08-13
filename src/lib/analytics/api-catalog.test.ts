import { describe, expect, it } from "vitest";

import {
  extractPhoneFromQuestion,
  isApiFirstQuestion,
  pickBestApiForQuestion,
  rankApisForQuestion,
} from "@/lib/analytics/api-catalog";

describe("api-catalog", () => {
  it("extracts phone from natural language", () => {
    expect(extractPhoneFromQuestion("查询客户手机号为16612341112的客户信息")).toBe(
      "16612341112",
    );
  });

  it("prefers CRM API for customer phone lookup", () => {
    const best = pickBestApiForQuestion("帮我查询客户手机号为16612341112的客户信息");
    expect(best?.endpoint.appCode).toBe("super-mario");
    expect(best?.endpoint.methodName).toBe("queryCustomerDetailsByContact");
    expect(best?.extractedParams.phone).toBe("16612341112");
  });

  it("prefers cheniu user API for 车牛用户", () => {
    const best = pickBestApiForQuestion("查车牛用户手机号13800138000的资料");
    expect(best?.endpoint.entity).toBe("cheniu_user");
  });

  it("prefers CRM crmQueryCustomerInfo for customer recordId", () => {
    const q = "我想知道客户 id 为 ANWbnMyLF0 的客户信息";
    const best = pickBestApiForQuestion(q);
    expect(best?.endpoint.methodName).toBe("crmQueryCustomerInfo");
    expect(best?.endpoint.http?.path).toContain("crmQueryCustomerInfo");
    expect(best?.extractedParams.recordId).toBe("ANWbnMyLF0");
    expect(isApiFirstQuestion(q)).toBe(true);
  });

  it("marks aggregate questions as not api-first", () => {
    expect(isApiFirstQuestion("统计正式车源有多少")).toBe(false);
  });

  it("ranks multiple candidates for member phone", () => {
    const ranked = rankApisForQuestion("会员手机号15912345678的权益");
    expect(ranked.some((item) => item.endpoint.entity === "member")).toBe(true);
  });
});

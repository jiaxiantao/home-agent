import { describe, expect, it } from "vitest";

import {
  maskFreeTextPii,
  maskQueryRows,
  isSensitiveColumn,
} from "@/lib/security/pii-mask";

describe("pii-mask", () => {
  it("detects sensitive columns", () => {
    expect(isSensitiveColumn("user_phone")).toBe(true);
    expect(isSensitiveColumn("car_status")).toBe(false);
  });

  it("masks sensitive values", () => {
    const rows = maskQueryRows(["user_phone", "cnt"], [{ user_phone: "13812345678", cnt: 3 }]);
    expect(String(rows[0]?.user_phone)).toContain("****");
    expect(rows[0]?.cnt).toBe(3);
  });
});

describe("maskFreeTextPii", () => {
  it("遮蔽模型自由复述出来的身份证号", () => {
    const masked = maskFreeTextPii("该客户身份证 330106199001011234，已完成认证。");
    expect(masked).not.toContain("330106199001011234");
    expect(masked).toContain("1234");
    expect(masked).toContain("已完成认证");
  });

  it("遮蔽银行卡号", () => {
    expect(maskFreeTextPii("打款账号 6222021234567890123")).not.toContain(
      "6222021234567890123",
    );
  });

  it("末位 X 的身份证同样遮蔽", () => {
    expect(maskFreeTextPii("身份证 11010119900307123X")).not.toContain(
      "11010119900307123X",
    );
  });

  it("不误伤普通数字与金额", () => {
    const text = "共 1258 辆车，成交额 4300000 元，同比增长 12.5%。";
    expect(maskFreeTextPii(text)).toBe(text);
  });

  it("不遮蔽手机号：用户常用它做查询条件，遮蔽会让回答自相矛盾", () => {
    const text = "手机号 13812345678 对应 1 位客户。";
    expect(maskFreeTextPii(text)).toBe(text);
  });
});

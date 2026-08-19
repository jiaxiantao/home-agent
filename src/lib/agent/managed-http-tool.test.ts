import { describe, expect, it } from "vitest";

import { assertStaticUrlOrigin } from "@/lib/agent/managed-http-tool";

describe("assertStaticUrlOrigin", () => {
  it("放行 origin 写死的模板", () => {
    expect(
      assertStaticUrlOrigin("https://super-mario.stable.dasouche.net/api/{{path}}"),
    ).toBeNull();
    expect(assertStaticUrlOrigin("https://a.dasouche.net/x")).toBeNull();
    expect(assertStaticUrlOrigin("https://a.dasouche.net")).toBeNull();
  });

  it("拒绝 host 段含占位符：模型可控值不得决定请求目标", () => {
    expect(assertStaticUrlOrigin("https://{{host}}/api")).toContain("不允许使用占位符");
    expect(assertStaticUrlOrigin("https://{{env}}.dasouche.net/api")).toContain(
      "不允许使用占位符",
    );
  });

  it("拒绝端口段含占位符", () => {
    expect(assertStaticUrlOrigin("http://127.0.0.1:{{port}}/x")).toContain(
      "不允许使用占位符",
    );
  });

  it("拒绝协议段含占位符", () => {
    expect(assertStaticUrlOrigin("{{scheme}}://a.dasouche.net/x")).toContain(
      "不允许使用占位符",
    );
  });
});

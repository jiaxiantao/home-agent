import { describe, expect, it } from "vitest";

import {
  httpMethodAllowsBody,
  httpMethodUsesBodyPanel,
  normalizeHttpMethod,
} from "@/lib/analytics/http-methods";

describe("http-methods", () => {
  it("normalizes method names", () => {
    expect(normalizeHttpMethod("put")).toBe("PUT");
    expect(normalizeHttpMethod("invalid")).toBe("GET");
  });

  it("detects body-capable methods", () => {
    expect(httpMethodAllowsBody("POST")).toBe(true);
    expect(httpMethodAllowsBody("PUT")).toBe(true);
    expect(httpMethodAllowsBody("GET")).toBe(false);
    expect(httpMethodUsesBodyPanel("PATCH")).toBe(true);
    expect(httpMethodUsesBodyPanel("HEAD")).toBe(false);
  });
});

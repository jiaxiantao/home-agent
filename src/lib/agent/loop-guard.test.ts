import { describe, expect, it } from "vitest";

import { AgentLoopGuard, fingerprintToolCall } from "@/lib/agent/loop-guard";

describe("fingerprintToolCall", () => {
  it("忽略键顺序，识别出同一次调用", () => {
    expect(fingerprintToolCall("route_api", { a: 1, b: 2 })).toBe(
      fingerprintToolCall("route_api", { b: 2, a: 1 }),
    );
  });

  it("参数不同则指纹不同", () => {
    expect(fingerprintToolCall("route_api", { question: "车源" })).not.toBe(
      fingerprintToolCall("route_api", { question: "客户" }),
    );
  });

  it("工具名不同则指纹不同", () => {
    expect(fingerprintToolCall("route_api", {})).not.toBe(
      fingerprintToolCall("search_api", {}),
    );
  });

  it("嵌套结构同样按键排序", () => {
    expect(fingerprintToolCall("call_backend_api", { body: { x: 1, y: 2 } })).toBe(
      fingerprintToolCall("call_backend_api", { body: { y: 2, x: 1 } }),
    );
  });
});

describe("AgentLoopGuard", () => {
  it("放行首次调用", () => {
    const guard = new AgentLoopGuard();
    expect(guard.admit("route_api", { question: "车源" }).allowed).toBe(true);
  });

  it("拦截参数完全相同的重复调用", () => {
    const guard = new AgentLoopGuard();
    guard.admit("route_api", { question: "车源" });
    const verdict = guard.admit("route_api", { question: "车源" });

    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.reason).toBe("duplicate");
      expect(verdict.message).toContain("不会重复执行");
    }
  });

  it("参数变化时继续放行", () => {
    const guard = new AgentLoopGuard();
    guard.admit("search_api", { keyword: "客户" });
    expect(guard.admit("search_api", { keyword: "车源" }).allowed).toBe(true);
  });

  it("达到 per-tool 预算后拦截", () => {
    const guard = new AgentLoopGuard({ budget: { route_api: 2 } });
    expect(guard.admit("route_api", { q: 1 }).allowed).toBe(true);
    expect(guard.admit("route_api", { q: 2 }).allowed).toBe(true);

    const verdict = guard.admit("route_api", { q: 3 });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.reason).toBe("budget");
      expect(verdict.message).toContain("达到上限");
    }
  });

  it("被拦截的调用不计入预算，避免二次惩罚", () => {
    const guard = new AgentLoopGuard({ budget: { route_api: 2 } });
    guard.admit("route_api", { q: 1 });
    guard.admit("route_api", { q: 1 }); // duplicate，不应消耗预算
    expect(guard.usedFor("route_api")).toBe(1);
    expect(guard.admit("route_api", { q: 2 }).allowed).toBe(true);
  });

  it("预算按工具独立计算", () => {
    const guard = new AgentLoopGuard({ budget: { route_api: 1, search_api: 1 } });
    expect(guard.admit("route_api", { q: 1 }).allowed).toBe(true);
    expect(guard.admit("search_api", { q: 1 }).allowed).toBe(true);
    expect(guard.admit("route_api", { q: 2 }).allowed).toBe(false);
  });

  it("未登记的工具使用兜底预算", () => {
    const guard = new AgentLoopGuard({ budget: {}, fallbackBudget: 2 });
    expect(guard.budgetFor("custom_http_tool")).toBe(2);
    expect(guard.admit("custom_http_tool", { a: 1 }).allowed).toBe(true);
    expect(guard.admit("custom_http_tool", { a: 2 }).allowed).toBe(true);
    expect(guard.admit("custom_http_tool", { a: 3 }).allowed).toBe(false);
  });
});

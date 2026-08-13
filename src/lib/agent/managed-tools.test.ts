import { afterEach, describe, expect, it } from "vitest";

import {
  createManagedHttpTool,
  deleteManagedTool,
  getActiveAgentToolCatalog,
  listManagedTools,
  resetManagedToolsForTest,
  updateManagedTool,
} from "@/lib/agent/managed-tools";

describe("managed tools", () => {
  afterEach(() => {
    resetManagedToolsForTest();
  });

  it("lists builtin agent tools", async () => {
    const tools = await listManagedTools();
    expect(tools.some((item) => item.name === "route_api")).toBe(true);
    expect(tools.some((item) => item.name === "call_backend_api")).toBe(true);
    expect(tools.every((item) => item.builtin || item.kind === "http")).toBe(true);
  });

  it("updates builtin label and description", async () => {
    const updated = await updateManagedTool("route_api", {
      label: "接口路由（测试）",
      description: "先匹配大风车 HTTP 接口",
    });
    expect(updated?.label).toBe("接口路由（测试）");
    expect(updated?.builtin).toBe(true);

    const catalog = await getActiveAgentToolCatalog();
    expect(catalog.find((item) => item.name === "route_api")?.label).toBe(
      "接口路由（测试）",
    );
  });

  it("creates a custom http tool and exposes it to the agent catalog", async () => {
    const created = await createManagedHttpTool({
      name: "query_demo_plate",
      label: "演示车牌查询",
      description: "按车牌调用测试 HTTP",
      args: { plate: "string" },
      createdBy: "test",
      http: {
        method: "POST",
        url: "https://crazyracing-kartrider.stable.dasouche.net/web/v3/carViewQuery/queryRecordPageInfo.json",
        bodyTemplate: { keywords: "{{plate}}", objCode: "car" },
      },
    });

    expect(created.builtin).toBe(false);
    expect(created.kind).toBe("http");

    const catalog = await getActiveAgentToolCatalog();
    expect(catalog.some((item) => item.name === "query_demo_plate")).toBe(true);
  });

  it("rejects deleting builtin tools", async () => {
    await expect(deleteManagedTool("propose_sql")).rejects.toThrow(/内置工具不可删除/);
  });

  it("keeps core tools enabled", async () => {
    const updated = await updateManagedTool("propose_sql", { enabled: false });
    expect(updated?.enabled).toBe(true);
  });
});

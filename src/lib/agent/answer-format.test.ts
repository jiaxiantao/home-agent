import { describe, expect, it } from "vitest";

import {
  formatBackendApiAnswer,
  formatRowsAsMarkdownTable,
} from "@/lib/agent/answer-format";

describe("answer-format", () => {
  it("formats rows as markdown table", () => {
    const table = formatRowsAsMarkdownTable(
      ["id", "name"],
      [{ id: "1", name: "张三" }],
    );

    expect(table).toContain("| id | name |");
    expect(table).toContain("| 1 | 张三 |");
  });

  it("formats backend api answer", () => {
    const text = formatBackendApiAnswer({
      status: "success",
      endpointId: "demo-endpoint",
      appCode: "super-mario",
      message: "ok",
      table: {
        columns: ["id", "name"],
        rows: [{ id: "ANwbnMyLF0", name: "测试客户" }],
      },
    });

    expect(text).toContain("demo-endpoint");
    expect(text).toContain("ANwbnMyLF0");
    expect(text).toContain("测试客户");
  });
});

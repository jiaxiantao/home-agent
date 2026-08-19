import { describe, expect, it } from "vitest";

import {
  formatBackendApiAnswer,
  formatBackendApiAnswers,
  formatRowsAsMarkdownTable,
  formatSqlAnswer,
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

  it("assembles multiple backend api answers", () => {
    const text = formatBackendApiAnswers([
      {
        status: "success",
        endpointId: "crm-contact",
        appCode: "super-mario",
        message: "ok",
        table: {
          columns: ["name"],
          rows: [{ name: "张三" }],
        },
      },
      {
        status: "success",
        endpointId: "kartrider-plate",
        appCode: "crazyracing-kartrider",
        message: "ok",
        table: {
          columns: ["plate_number"],
          rows: [{ plate_number: "皖JV066M" }],
        },
      },
    ]);

    expect(text).toContain("数据源 1");
    expect(text).toContain("张三");
    expect(text).toContain("数据源 2");
    expect(text).toContain("皖JV066M");
  });

  it("formats single-row SQL as bullet list with readable nested fields", () => {
    const text = formatSqlAnswer({
      sql: "select ...",
      columns: ["vin_number", "name", "mileage"],
      rows: [
        {
          vin_number: "TEST5566345677888",
          name: { displayValue: "奥迪Q5 2018款 典藏版 40 TFSI 进取型" },
          mileage: 20000,
        },
      ],
      rowCount: 1,
      truncated: false,
    });

    expect(text).toContain("查询成功，返回 1 行");
    expect(text).toContain("**name**：奥迪Q5 2018款 典藏版 40 TFSI 进取型");
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("| name |");
  });
});

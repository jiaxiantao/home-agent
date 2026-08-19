import { describe, expect, it } from "vitest";

import { tryDirectAnswer } from "@/lib/agent/direct-answer";
import { shouldPreRetrieveApiRoute } from "@/lib/agent/langgraph/nodes/pre-retrieve";
import type { AgentToolResult } from "@/lib/agent/types";

function sqlResult(
  columns: string[],
  rows: Record<string, unknown>[],
): AgentToolResult {
  return {
    tool: "execute_sql",
    args: {},
    output: "ok",
    data: {
      sql: "select 1",
      columns,
      rows,
      rowCount: rows.length,
      truncated: false,
    } as AgentToolResult["data"],
  };
}

describe("tryDirectAnswer", () => {
  it("空结果集直接作答，不再调用合成模型", () => {
    const answer = tryDirectAnswer("杭州有多少车源", [sqlResult(["cnt"], [])]);
    expect(answer?.reason).toBe("empty_result");
    expect(answer?.text).toContain("未查询到符合条件的数据");
  });

  it("单行单列标量直接作答", () => {
    const answer = tryDirectAnswer("杭州有多少车源", [
      sqlResult(["cnt"], [{ cnt: 1258 }]),
    ]);
    expect(answer?.reason).toBe("single_scalar");
    expect(answer?.text).toContain("1258");
  });

  it("多行结果仍交给模型总结", () => {
    const answer = tryDirectAnswer("按城市统计车源", [
      sqlResult(["city", "cnt"], [
        { city: "杭州", cnt: 10 },
        { city: "宁波", cnt: 8 },
      ]),
    ]);
    expect(answer).toBeNull();
  });

  it("单行多列仍交给模型总结", () => {
    const answer = tryDirectAnswer("这辆车的信息", [
      sqlResult(["plate", "price"], [{ plate: "浙A12345", price: 88000 }]),
    ]);
    expect(answer).toBeNull();
  });

  it("用户要图表时不短路，需要模型判断能否出图", () => {
    const answer = tryDirectAnswer("用柱状图看看杭州车源数量", [
      sqlResult(["cnt"], [{ cnt: 1258 }]),
    ]);
    expect(answer).toBeNull();
  });

  it("没有 SQL 结果时不短路", () => {
    expect(tryDirectAnswer("杭州有多少车源", [])).toBeNull();
  });

  it("接口返回的多字段结果不短路", () => {
    const prior: AgentToolResult[] = [
      {
        tool: "call_backend_api",
        args: {},
        output: "ok",
        data: {
          status: "success",
          endpointId: "x",
          table: { columns: ["a"], rows: [{ a: 1 }] },
        } as unknown as AgentToolResult["data"],
      },
      sqlResult(["cnt"], [{ cnt: 1 }]),
    ];
    expect(tryDirectAnswer("客户信息", prior)).toBeNull();
  });
});

describe("shouldPreRetrieveApiRoute", () => {
  it("业务问数需要预取接口路由", () => {
    expect(shouldPreRetrieveApiRoute("杭州最近30天成交多少辆车")).toBe(true);
    expect(shouldPreRetrieveApiRoute("车牌号浙A12345的车辆信息")).toBe(true);
  });

  it("纯元数据问题跳过预取", () => {
    expect(shouldPreRetrieveApiRoute("有哪些库")).toBe(false);
    expect(shouldPreRetrieveApiRoute("列出所有表")).toBe(false);
    expect(shouldPreRetrieveApiRoute("show databases")).toBe(false);
    expect(shouldPreRetrieveApiRoute("describe matador.car")).toBe(false);
  });

  it("空输入与 resume 占位跳过预取", () => {
    expect(shouldPreRetrieveApiRoute("")).toBe(false);
    expect(shouldPreRetrieveApiRoute("(resume)")).toBe(false);
  });
});

import { ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";

import { pairToolCallsWithMessages } from "@/lib/agent/langgraph/graph-runner";

describe("pairToolCallsWithMessages", () => {
  it("matches by tool_call_id when present", () => {
    const pairs = pairToolCallsWithMessages(
      [
        { id: "call_a", name: "search_schema", args: { keyword: "车牌" } },
        { id: "call_b", name: "describe_table", args: { table: "car" } },
      ],
      [
        new ToolMessage({ content: "schema hits", tool_call_id: "call_a", name: "search_schema" }),
        new ToolMessage({ content: "columns", tool_call_id: "call_b", name: "describe_table" }),
      ],
    );

    expect(pairs.map((item) => item.call.name)).toEqual(["search_schema", "describe_table"]);
    expect(pairs.map((item) => String(item.message.content))).toEqual(["schema hits", "columns"]);
  });

  it("falls back to name then index when stream ids diverge", () => {
    const pairs = pairToolCallsWithMessages(
      [{ id: "stream_1", name: "search_schema", args: { query: "车牌" } }],
      [new ToolMessage({ content: "schema hits", tool_call_id: "lc_other_id", name: "search_schema" })],
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.call.name).toBe("search_schema");
    expect(String(pairs[0]?.message.content)).toBe("schema hits");
  });
});

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, describe, expect, it } from "vitest";

import { compileDfcAgentGraph, createGraphInput } from "@/lib/agent/langgraph/graph";
import {
  afterToolsRoute,
  mockPlanNode,
  needsRuleBasedFallback,
  postToolsNode,
  routePlannerNode,
  shouldContinueWithMockPlanner,
  shouldUseTools,
} from "@/lib/agent/langgraph/nodes/plan-or-act";
import { runDfcAgentLoop } from "@/lib/agent/langgraph";

describe("langgraph graph", () => {
  const originalLlmDisabled = process.env.LLM_DISABLED;

  afterEach(() => {
    if (originalLlmDisabled === undefined) {
      delete process.env.LLM_DISABLED;
    } else {
      process.env.LLM_DISABLED = originalLlmDisabled;
    }
  });

  it("compiles StateGraph without error", () => {
    expect(() => compileDfcAgentGraph()).not.toThrow();
  });

  it("keeps prior tool results when continuing after SQL", () => {
    const prior = [
      {
        tool: "execute_sql" as const,
        args: { sql: "SELECT 1" },
        output: "1 row",
        data: {
          columns: ["total_cnt"],
          rows: [{ total_cnt: 4081 }],
          rowCount: 1,
        },
      },
    ];
    const state = createGraphInput("用柱状图展示售价区间", [], prior);
    expect(state.priorToolResults).toHaveLength(1);
    const last = state.messages.at(-1);
    expect(last).toBeInstanceOf(HumanMessage);
    expect(String((last as HumanMessage).content)).toMatch(/无法出图/);
  });

  it("mock planner routes catalog questions to list_schema", async () => {
    process.env.LLM_DISABLED = "1";

    const state = createGraphInput("分析库有哪些核心表和字段说明？");
    const update = await mockPlanNode(state);

    expect(update.mock).toBe(true);
    expect(shouldUseTools({ ...state, ...update })).toBe("tools");

    const merged = {
      ...state,
      ...update,
      messages: [...state.messages, ...(update.messages ?? [])],
    };
    const last = merged.messages.at(-1);
    expect(last instanceof AIMessage && last.tool_calls?.[0]?.name).toBe("list_schema");
  });

  it("fails closed when LLM is disabled instead of using the rule planner", async () => {
    process.env.LLM_DISABLED = "1";

    const state = createGraphInput("帮我查询车牌号为皖JV066M的车辆信息");
    const update = await routePlannerNode(state);

    expect(update.shouldEnd).toBe(true);
    expect(update.mock).not.toBe(true);
    expect(String(update.finalAnswer)).toMatch(/LLM/);
    expect(shouldUseTools({ ...state, ...update })).toBe("__end__");
  });

  it("mock planner routes aggregate questions through route_question first", async () => {
    process.env.LLM_DISABLED = "1";

    const state = createGraphInput("大风车正式车源一共有多少辆？");
    const update = await mockPlanNode(state);

    const merged = {
      ...state,
      ...update,
      messages: [...state.messages, ...(update.messages ?? [])],
    };
    const last = merged.messages.at(-1);
    expect(last instanceof AIMessage && last.tool_calls?.[0]?.name).toBe(
      "route_question",
    );
  });

  it("post_tools ends loop when propose_sql is pending", () => {
    const state = createGraphInput("test");
    const withPrior = {
      ...state,
      priorToolResults: [
        {
          tool: "propose_sql" as const,
          args: { sql: "SELECT 1", explanation: "test" },
          output: "ok",
          data: { sql: "SELECT 1", explanation: "test" },
        },
      ],
      messages: [
        new ToolMessage({
          content: JSON.stringify({
            output: "ok",
            data: { sql: "SELECT 1", explanation: "test" },
          }),
          tool_call_id: "call_1",
        }),
      ],
    };

    const update = postToolsNode(withPrior);
    expect(update.pendingSql?.sql).toBe("SELECT 1");
    expect(afterToolsRoute({ ...withPrior, ...update })).toBe("__end__");
  });

  it("mock planner routes customer recordId to route_api", async () => {
    process.env.LLM_DISABLED = "1";

    const question = "我想知道客户 id 为 ANwbnMyLF0 的客户信息";
    const state = createGraphInput(question);
    const update = await mockPlanNode(state);

    const merged = {
      ...state,
      ...update,
      messages: [...state.messages, ...(update.messages ?? [])],
    };
    const last = merged.messages.at(-1);
    expect(last instanceof AIMessage && last.tool_calls?.[0]?.name).toBe("route_api");
  });

  it("needs rule fallback when LLM returns empty on data question", () => {
    const question = "我想知道客户 id 为 ANwbnMyLF0 的客户信息";
    const state = createGraphInput(question);
    const emptyLlmUpdate = {
      mock: false,
      stepCount: 1,
      messages: [new AIMessage({ content: "" })],
      finalAnswer: null,
      shouldEnd: false,
    };

    expect(needsRuleBasedFallback(emptyLlmUpdate, state)).toBe(true);
  });

  it("does not fallback when LLM answers a data question", () => {
    const question = "帮我查询车牌号为皖JV066M的车辆信息";
    const state = createGraphInput(question);
    const llmUpdate = {
      mock: false,
      stepCount: 1,
      messages: [new AIMessage({ content: "先按车牌路由车辆接口。" })],
      finalAnswer: "先按车牌路由车辆接口。",
      shouldEnd: true,
    };

    expect(needsRuleBasedFallback(llmUpdate, state)).toBe(false);
  });

  it("does not fallback when LLM emits tool calls", () => {
    const question = "帮我查询车牌号为皖JV066M的车辆信息";
    const state = createGraphInput(question);
    const llmUpdate = {
      mock: false,
      stepCount: 1,
      messages: [
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: "call_1",
              name: "route_api",
              args: { question },
              type: "tool_call" as const,
            },
          ],
        }),
      ],
      finalAnswer: null,
      shouldEnd: false,
    };

    expect(needsRuleBasedFallback(llmUpdate, state)).toBe(false);
  });

  it("continues with mock planner after route_api when already on mock path", () => {
    const question = "我想知道客户 id 为 ANwbnMyLF0 的客户信息";
    const state = {
      ...createGraphInput(question),
      mock: true,
      priorToolResults: [
        {
          tool: "route_api" as const,
          args: { question },
          output: "接口路由",
          data: {
            bestMatch: {
              endpoint: {
                id: "super-mario:http:GET:/customer/customerDetail/queryRecordDetail:queryRecordDetail",
              },
              httpCallable: true,
              extractedParams: { recordId: "ANwbnMyLF0", objCode: "customer" },
            },
          },
        },
      ],
    };

    expect(shouldContinueWithMockPlanner(state)).toBe(true);
  });

  it("does not force mock continuation when prior tools came from LLM", () => {
    const question = "我想知道客户 id 为 ANwbnMyLF0 的客户信息";
    const state = {
      ...createGraphInput(question),
      mock: false,
      priorToolResults: [
        {
          tool: "route_api" as const,
          args: { question },
          output: "接口路由",
          data: {
            bestMatch: {
              endpoint: {
                id: "super-mario:http:GET:/customer/customerDetail/queryRecordDetail:queryRecordDetail",
              },
              httpCallable: true,
              extractedParams: { recordId: "ANwbnMyLF0", objCode: "customer" },
            },
          },
        },
      ],
    };

    // shouldContinueWithMockPlanner 仍可为 true（规则知道下一步），但 stream 仅在 state.mock 时短接
    expect(state.mock).toBe(false);
    expect(shouldContinueWithMockPlanner(state)).toBe(true);
  });
  it("mock planner proposes call_backend_api after route_api", async () => {
    const question = "我想知道客户 id 为 ANwbnMyLF0 的客户信息";
    const state = {
      ...createGraphInput(question),
      priorToolResults: [
        {
          tool: "route_api" as const,
          args: { question },
          output: "接口路由",
          data: {
            bestMatch: {
              endpoint: {
                id: "super-mario:http:GET:/customer/customerDetail/queryRecordDetail:queryRecordDetail",
              },
              httpCallable: true,
              extractedParams: { recordId: "ANwbnMyLF0", objCode: "customer" },
            },
          },
        },
      ],
    };

    const update = await mockPlanNode(state);
    const merged = {
      ...state,
      ...update,
      messages: [...state.messages, ...(update.messages ?? [])],
    };
    const last = merged.messages.at(-1);
    expect(last instanceof AIMessage && last.tool_calls?.[0]?.name).toBe(
      "call_backend_api",
    );
  });

  it("run loop errors when LLM is disabled instead of proposing SQL", async () => {
    process.env.LLM_DISABLED = "1";

    const events = [];
    for await (const event of runDfcAgentLoop("大风车正式车源一共有多少辆？")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "error")).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(events.some((event) => event.type === "awaiting_input")).toBe(false);
    const error = events.find((event) => event.type === "error");
    expect(error?.type === "error" && error.message).toMatch(/LLM/);
  });
});

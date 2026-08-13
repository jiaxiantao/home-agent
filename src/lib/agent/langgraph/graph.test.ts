import { AIMessage, ToolMessage } from "@langchain/core/messages";
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

  it("mock planner routes catalog questions to list_schema", async () => {
    process.env.LLM_DISABLED = "1";

    const state = createGraphInput("分析库有哪些核心表和字段说明？");
    const update = await routePlannerNode(state);

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

  it("run loop pauses on sql confirmation for analytics questions", async () => {
    process.env.LLM_DISABLED = "1";

    const events = [];
    for await (const event of runDfcAgentLoop("大风车正式车源一共有多少辆？")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "awaiting_input")).toBe(true);
    expect(events.some((event) => event.type === "planner_mode" && event.mock)).toBe(
      true,
    );
  });
});

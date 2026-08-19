import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentTraceEvent } from "@/lib/agent/types";
import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";

type PlannerTick =
  | { kind: "delta"; text: string; delta: string }
  | { kind: "fail"; message: string }
  | { kind: "result"; update: Partial<DfcAgentStateType> };

const plannerScript: PlannerTick[][] = [];
let toolHandler: (state: DfcAgentStateType) => Promise<Partial<DfcAgentStateType>>;

vi.mock("@/lib/agent/langgraph/nodes/plan-or-act", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/agent/langgraph/nodes/plan-or-act")
  >();
  return {
    ...actual,
    async *streamRoutePlannerNode() {
      const ticks = plannerScript.shift() ?? [
        { kind: "result" as const, update: { stepCount: 99, shouldEnd: true } },
      ];
      for (const tick of ticks) {
        yield tick;
      }
    },
  };
});

vi.mock("@/lib/agent/langgraph/graph-runner", () => ({
  createToolsNodeHandler: () => (state: DfcAgentStateType) => toolHandler(state),
}));

vi.mock("@/lib/agent/langgraph/nodes/answer", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/agent/langgraph/nodes/answer")
  >();
  return {
    ...actual,
    async *streamFinalAnswerFromState(input: { fallback: string }) {
      yield {
        type: "answer_stream" as const,
        text: input.fallback,
        delta: input.fallback,
      };
      return { answer: input.fallback, mock: false, followUps: [] };
    },
  };
});

const { compileDfcAgentGraph, createGraphInput } = await import(
  "@/lib/agent/langgraph/graph"
);

function plannerCallsTool(name: string, args: Record<string, unknown>): PlannerTick[] {
  return [
    { kind: "delta", text: "思考中", delta: "思考中" },
    {
      kind: "result",
      update: {
        mock: false,
        stepCount: 1,
        messages: [
          new AIMessage({
            content: "",
            tool_calls: [{ id: `call_${name}`, name, args, type: "tool_call" }],
          }),
        ],
      },
    },
  ];
}

async function drain(graph: ReturnType<typeof compileDfcAgentGraph>, question: string) {
  const events: AgentTraceEvent[] = [];
  let finalState: DfcAgentStateType | undefined;

  const stream = await graph.stream(createGraphInput(question), {
    streamMode: ["custom", "values"],
    recursionLimit: 30,
  });

  for await (const [mode, chunk] of stream as AsyncIterable<
    [string, AgentTraceEvent | DfcAgentStateType]
  >) {
    if (mode === "custom") {
      events.push(chunk as AgentTraceEvent);
    } else {
      finalState = chunk as DfcAgentStateType;
    }
  }

  return { events, finalState };
}

describe("compiled agent graph", () => {
  beforeEach(() => {
    plannerScript.length = 0;
    toolHandler = async () => ({});
  });

  it("streams plan, tool and answer events for a tool round trip", async () => {
    plannerScript.push(plannerCallsTool("list_tables", { database: "matador" }));
    plannerScript.push([
      {
        kind: "result",
        update: {
          mock: false,
          stepCount: 2,
          shouldEnd: true,
          finalAnswer: "matador 库有 3 张表。",
          messages: [new AIMessage({ content: "matador 库有 3 张表。" })],
        },
      },
    ]);

    toolHandler = async () => ({
      messages: [
        new ToolMessage({
          content: JSON.stringify({ output: "car, car_extra, shop" }),
          tool_call_id: "call_list_tables",
        }),
      ],
      priorToolResults: [
        {
          tool: "list_tables" as const,
          args: { database: "matador" },
          output: "car, car_extra, shop",
        },
      ],
    });

    const graph = compileDfcAgentGraph({ preRetrieve: false });
    const { events, finalState } = await drain(graph, "matador 有哪些表");

    const types = events.map((event) => event.type);
    expect(types).toContain("plan_stream");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("step_metric");
    expect(types).toContain("answer");

    const answer = events.find((event) => event.type === "answer");
    expect(answer?.type === "answer" && answer.text).toBe("matador 库有 3 张表。");
    expect(finalState?.toolCallCount).toBe(1);
  });

  it("emits every parallel tool call, not just the first", async () => {
    plannerScript.push([
      {
        kind: "result",
        update: {
          mock: false,
          stepCount: 1,
          messages: [
            new AIMessage({
              content: "",
              tool_calls: [
                {
                  id: "call_a",
                  name: "list_tables",
                  args: { database: "matador" },
                  type: "tool_call",
                },
                {
                  id: "call_b",
                  name: "list_databases",
                  args: {},
                  type: "tool_call",
                },
              ],
            }),
          ],
        },
      },
    ]);
    plannerScript.push([
      {
        kind: "result",
        update: { mock: false, stepCount: 2, shouldEnd: true, finalAnswer: "好了" },
      },
    ]);

    toolHandler = async () => ({
      messages: [
        new ToolMessage({ content: "{}", tool_call_id: "call_a" }),
        new ToolMessage({ content: "{}", tool_call_id: "call_b" }),
      ],
      priorToolResults: [],
    });

    const graph = compileDfcAgentGraph({ preRetrieve: false });
    const { events, finalState } = await drain(graph, "看看有哪些库和表");

    const called = events
      .filter((event) => event.type === "tool_call")
      .map((event) => (event.type === "tool_call" ? event.tool : ""));
    expect(called).toEqual(["list_tables", "list_databases"]);
    expect(finalState?.toolCallCount).toBe(2);
  });

  it("pauses for confirmation instead of answering when SQL is proposed", async () => {
    plannerScript.push(
      plannerCallsTool("propose_sql", { sql: "SELECT 1", explanation: "计数" }),
    );

    toolHandler = async () => ({
      messages: [
        new ToolMessage({
          content: JSON.stringify({
            output: "ok",
            data: { sql: "SELECT 1", explanation: "计数" },
          }),
          tool_call_id: "call_propose_sql",
        }),
      ],
      priorToolResults: [
        {
          tool: "propose_sql" as const,
          args: { sql: "SELECT 1", explanation: "计数" },
          output: "ok",
          data: { sql: "SELECT 1", explanation: "计数" },
        },
      ],
    });

    const paused: string[] = [];
    const graph = compileDfcAgentGraph({
      preRetrieve: false,
      threadId: "thread_test",
      userId: "tester",
      onAwaitingInput: (pause) => {
        paused.push(pause.runId);
      },
    });
    const { events, finalState } = await drain(graph, "统计一下车源数量");

    const awaiting = events.find((event) => event.type === "awaiting_input");
    expect(awaiting?.type === "awaiting_input" && awaiting.sql).toBe("SELECT 1");
    expect(events.some((event) => event.type === "answer")).toBe(false);
    expect(paused).toHaveLength(1);
    expect(finalState?.awaitingInput).toBe(true);
  });

  it("ends with a terminal error when the planner fails", async () => {
    plannerScript.push([{ kind: "fail", message: "LLM 调用失败：503" }]);

    const graph = compileDfcAgentGraph({ preRetrieve: false });
    const { events, finalState } = await drain(graph, "随便问点什么");

    expect(finalState?.terminalError).toMatch(/503/);
    expect(events.some((event) => event.type === "answer")).toBe(false);
  });
});

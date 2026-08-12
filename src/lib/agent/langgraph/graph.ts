import { END, START, StateGraph } from "@langchain/langgraph";

import type { ThreadTurn } from "@/lib/agent/planner";
import { DfcAgentState, type DfcAgentStateType } from "@/lib/agent/langgraph/state";
import {
  afterToolsRoute,
  buildInitialMessages,
  postToolsNode,
  routePlannerNode,
  shouldUseTools,
} from "@/lib/agent/langgraph/nodes/plan-or-act";
import { createToolsNodeHandler } from "@/lib/agent/langgraph/graph-runner";

export type CompileGraphOptions = {
  conversation?: ThreadTurn[];
};

export function compileDfcAgentGraph(options: CompileGraphOptions = {}) {
  const conversation = options.conversation ?? [];
  const runTools = createToolsNodeHandler();

  const graph = new StateGraph(DfcAgentState)
    .addNode("agent", (state: DfcAgentStateType) => routePlannerNode(state, conversation))
    .addNode("tools", runTools)
    .addNode("post_tools", postToolsNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldUseTools, {
      tools: "tools",
      post_tools: "post_tools",
      __end__: END,
    })
    .addEdge("tools", "post_tools")
    .addConditionalEdges("post_tools", afterToolsRoute, {
      agent: "agent",
      __end__: END,
    });

  return graph.compile();
}

export function createGraphInput(
  userMessage: string,
  conversation: ThreadTurn[] = [],
): DfcAgentStateType {
  return {
    userMessage,
    messages: buildInitialMessages(userMessage, conversation),
    priorToolResults: [],
    stepCount: 0,
    mock: false,
    pendingSql: null,
    finalAnswer: null,
    shouldEnd: false,
  };
}

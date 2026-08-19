import {
  END,
  START,
  StateGraph,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { getAgentMaxSteps } from "@/lib/agent/config";
import { AgentLoopGuard } from "@/lib/agent/loop-guard";
import type { ThreadTurn } from "@/lib/agent/planner";
import { formatPriorContinuationPrompt } from "@/lib/agent/planner-context";
import type {
  AgentToolResult,
  AgentTraceEvent,
  ProposeSqlData,
} from "@/lib/agent/types";
import { DfcAgentState, type DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createToolsNodeHandler } from "@/lib/agent/langgraph/graph-runner";
import {
  afterToolsRoute,
  buildAgentExhaustedAnswer,
  buildInitialMessages,
  postToolsNode,
  routePlannerNode,
  shouldUseTools,
  streamRoutePlannerNode,
} from "@/lib/agent/langgraph/nodes/plan-or-act";
import { preRetrieveApiRoute } from "@/lib/agent/langgraph/nodes/pre-retrieve";
import {
  answerEvent,
  backendApiA2uiEvents,
  resolveTerminalAnswer,
  streamFinalAnswerFromState,
} from "@/lib/agent/langgraph/nodes/answer";
import { pauseForSqlConfirmation } from "@/lib/agent/langgraph/nodes/hitl";
import {
  planStreamEvent,
  plannerModeEvent,
  stepMetricEvent,
  tracePlanStep,
} from "@/lib/agent/langgraph/stream-adapter";
import {
  STREAM_HEARTBEAT_MS,
  withIdleHeartbeat,
} from "@/lib/agent/stream-heartbeat";
import type { LlmProvider } from "@/lib/llm-providers-catalog";
import type { AuditContext } from "@/lib/security/audit-log";
import type { SsoCredentials } from "@/lib/security/sso-credentials";

export type AgentGraphDeps = {
  conversation?: ThreadTurn[];
  llmProvider?: LlmProvider;
  sso?: SsoCredentials | null;
  guard?: AgentLoopGuard;
  startedAt?: number;
  signal?: AbortSignal;
  /** 关闭后 pre_retrieve 直通；resume 与单测走这条路 */
  preRetrieve?: boolean;
  threadId?: string;
  userId?: string;
  audit?: AuditContext;
  /** 最终回答落库由调用方完成，图只负责产出 */
  onFinalAnswer?: (answer: {
    text: string;
    mock?: boolean;
    followUps: string[];
  }) => Promise<void> | void;
  onAwaitingInput?: (pause: {
    runId: string;
    sql: string;
    explanation: string;
  }) => Promise<void> | void;
};

/** 节点向 custom stream 写事件；未开启 custom 模式时静默丢弃 */
function emit(config: LangGraphRunnableConfig, event: AgentTraceEvent) {
  config.writer?.(event);
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Agent request aborted");
  }
}

export function compileDfcAgentGraph(options: AgentGraphDeps = {}) {
  const conversation = options.conversation ?? [];
  const guard = options.guard ?? new AgentLoopGuard();
  const startedAt = options.startedAt ?? performance.now();
  const maxSteps = getAgentMaxSteps();
  const runTools = createToolsNodeHandler(options.sso, {
    userId: options.userId,
    guard,
  });

  async function preRetrieveNode(
    state: DfcAgentStateType,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DfcAgentStateType>> {
    if (options.preRetrieve === false || state.priorToolResults.length > 0) {
      return {};
    }

    const preRetrieved = await preRetrieveApiRoute(state.userMessage);
    if (!preRetrieved) {
      return {};
    }

    guard.record("route_api", { question: state.userMessage });
    emit(config, {
      type: "trace",
      phase: "plan",
      message: "已预取接口路由结果，跳过一次规划调用",
    });
    emit(config, {
      type: "tool_result",
      tool: "route_api",
      output: preRetrieved.prior.output,
      data: preRetrieved.prior.data,
    });

    return {
      messages: [preRetrieved.contextMessage],
      priorToolResults: [preRetrieved.prior],
    };
  }

  async function agentNode(
    state: DfcAgentStateType,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DfcAgentStateType>> {
    assertNotAborted(options.signal);

    const step = state.stepCount + 1;
    emit(config, tracePlanStep(step));
    emit(config, planStreamEvent({ step, text: "正在规划…", delta: "正在规划…" }));

    const planStartedAt = performance.now();

    async function* plannerStream() {
      yield* streamRoutePlannerNode(state, conversation, options.llmProvider, {
        userId: options.userId,
        signal: options.signal,
      });
    }

    let update: Partial<DfcAgentStateType> = {};
    let failure: string | null = null;

    for await (const item of withIdleHeartbeat(
      plannerStream(),
      STREAM_HEARTBEAT_MS,
      (waitedMs) => ({
        kind: "delta" as const,
        text: `规划进行中… 已等待 ${Math.max(1, Math.round(waitedMs / 1000))} 秒`,
        delta: "",
      }),
    )) {
      assertNotAborted(options.signal);
      if (item.kind === "delta") {
        emit(config, planStreamEvent({ step, text: item.text, delta: item.delta }));
        continue;
      }
      if (item.kind === "fail") {
        failure = item.message;
        break;
      }
      update = item.update;
    }

    if (failure) {
      emit(config, { type: "trace", phase: "plan", message: failure });
      return { terminalError: failure, shouldEnd: true, lastPlanMs: 0 };
    }

    emit(config, plannerModeEvent(update.mock ?? state.mock));
    return { ...update, lastPlanMs: Math.round(performance.now() - planStartedAt) };
  }

  async function toolsNode(
    state: DfcAgentStateType,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DfcAgentStateType>> {
    assertNotAborted(options.signal);

    const lastAi = state.messages.findLast(
      (message): message is AIMessage => message instanceof AIMessage,
    );
    const calls = lastAi?.tool_calls ?? [];

    // 每个 tool_call 单独播报：之前只报第一个，并行调用在 trace 里是隐形的
    for (const call of calls) {
      const args = call.args as Record<string, unknown>;
      emit(config, {
        type: "plan",
        plan: {
          action: "tool",
          tool: call.name,
          args,
          reasoning:
            typeof lastAi?.content === "string" ? lastAi.content : "LangGraph 工具调用",
        },
      });
      emit(config, { type: "tool_call", tool: call.name, args });
    }

    const toolStartedAt = performance.now();

    type ToolTick =
      | { kind: "result"; update: Partial<DfcAgentStateType> }
      | { kind: "beat"; waitedMs: number };

    async function* toolWait(): AsyncGenerator<ToolTick> {
      yield { kind: "result", update: await runTools(state) };
    }

    let update: Partial<DfcAgentStateType> = {};
    for await (const item of withIdleHeartbeat<ToolTick>(
      toolWait(),
      STREAM_HEARTBEAT_MS,
      (waitedMs) => ({ kind: "beat", waitedMs }),
    )) {
      assertNotAborted(options.signal);
      if (item.kind === "beat") {
        emit(config, {
          type: "trace",
          phase: "tool",
          message: `工具执行中… 已等待 ${Math.max(1, Math.round(item.waitedMs / 1000))} 秒`,
        });
        continue;
      }
      update = item.update;
    }

    for (const result of update.priorToolResults ?? []) {
      emit(config, {
        type: "tool_result",
        tool: result.tool,
        output: result.output,
        data: result.data,
      });
    }

    emit(
      config,
      stepMetricEvent({
        step: state.stepCount,
        planMs: state.lastPlanMs,
        toolMs: Math.round(performance.now() - toolStartedAt),
        startedAt,
      }),
    );

    return { ...update, toolCallCount: state.toolCallCount + calls.length };
  }

  async function postToolsNodeWithHitl(
    state: DfcAgentStateType,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DfcAgentStateType>> {
    const update = postToolsNode(state);
    const pending = (update.pendingSql ?? null) as ProposeSqlData | null;

    if (pending && options.threadId && options.userId) {
      const pause = await pauseForSqlConfirmation(
        pending,
        state.priorToolResults,
        {
          message: state.userMessage,
          threadId: options.threadId,
          userId: options.userId,
          clientIp: options.audit?.clientIp,
          audit: options.audit,
          mock: state.mock,
        },
      );
      for (const event of pause.events) {
        emit(config, event);
      }
      await options.onAwaitingInput?.(pause);
      return { ...update, awaitingInput: true, shouldEnd: true };
    }

    if (state.stepCount >= maxSteps && !update.finalAnswer) {
      return {
        ...update,
        shouldEnd: true,
        finalAnswer: buildAgentExhaustedAnswer(state.priorToolResults, maxSteps),
      };
    }

    return update;
  }

  async function finalizeNode(
    state: DfcAgentStateType,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DfcAgentStateType>> {
    assertNotAborted(options.signal);
    emit(config, { type: "trace", phase: "answer", message: "整理最终回答" });

    for (const event of backendApiA2uiEvents(state.priorToolResults)) {
      emit(config, event);
    }

    const generator = streamFinalAnswerFromState({
      state,
      message: state.userMessage,
      conversation,
      fallback: resolveTerminalAnswer(state),
    });

    let next = await generator.next();
    while (!next.done) {
      emit(config, next.value);
      next = await generator.next();
    }
    const finalized = next.value;

    emit(config, {
      type: "plan",
      plan: {
        action: "answer",
        answer: finalized.answer,
        reasoning: state.mock ? "规则规划器完成" : "生成最终回答",
      },
    });
    emit(
      config,
      stepMetricEvent({
        step: state.stepCount,
        planMs: state.lastPlanMs,
        startedAt,
      }),
    );

    // 落库先于事件：前端拿到 answer 后可能立刻刷新历史
    await options.onFinalAnswer?.({
      text: finalized.answer,
      mock: finalized.mock ?? state.mock,
      followUps: finalized.followUps,
    });

    emit(
      config,
      answerEvent({
        text: finalized.answer,
        mock: finalized.mock ?? state.mock,
        followUps: finalized.followUps,
      }),
    );

    return { finalAnswer: finalized.answer, shouldEnd: true };
  }

  return new StateGraph(DfcAgentState)
    .addNode("pre_retrieve", preRetrieveNode)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addNode("post_tools", postToolsNodeWithHitl)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "pre_retrieve")
    .addEdge("pre_retrieve", "agent")
    .addConditionalEdges("agent", routeAfterAgent, {
      tools: "tools",
      finalize: "finalize",
      __end__: END,
    })
    .addEdge("tools", "post_tools")
    .addConditionalEdges("post_tools", routeAfterTools, {
      agent: "agent",
      finalize: "finalize",
      __end__: END,
    })
    .addEdge("finalize", END)
    .compile();
}

/** 规划失败与 HITL 挂起直接收敛；有工具调用去执行；否则进合成 */
export function routeAfterAgent(
  state: DfcAgentStateType,
): "tools" | "finalize" | "__end__" {
  if (state.terminalError || state.awaitingInput) {
    return "__end__";
  }
  return shouldUseTools(state) === "tools" ? "tools" : "finalize";
}

/** HITL 挂起时本次运行到此为止，恢复是一次全新的图运行 */
export function routeAfterTools(
  state: DfcAgentStateType,
): "agent" | "finalize" | "__end__" {
  if (state.awaitingInput || state.terminalError) {
    return "__end__";
  }
  return afterToolsRoute(state) === "agent" ? "agent" : "finalize";
}

export function createGraphInput(
  userMessage: string,
  conversation: ThreadTurn[] = [],
  prior: AgentToolResult[] = [],
): DfcAgentStateType {
  const messages = buildInitialMessages(userMessage, conversation);
  if (prior.length) {
    messages.push(new HumanMessage(formatPriorContinuationPrompt(userMessage, prior)));
  }

  return {
    userMessage,
    messages,
    priorToolResults: prior,
    stepCount: 0,
    toolCallCount: 0,
    mock: false,
    pendingSql: null,
    finalAnswer: null,
    shouldEnd: false,
    terminalError: null,
    awaitingInput: false,
    lastPlanMs: 0,
  };
}

export { routePlannerNode };

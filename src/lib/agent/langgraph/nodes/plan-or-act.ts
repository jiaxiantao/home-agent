import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";

import { getAgentMaxSteps } from "@/lib/agent/config";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import type { ThreadTurn } from "@/lib/agent/planner";
import type { AgentToolResult } from "@/lib/agent/types";
import { createChatModel, isLangGraphLlmEnabled } from "@/lib/agent/langgraph/model";
import { buildAgentSystemPrompt } from "@/lib/agent/langgraph/prompts";
import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createLangChainTools } from "@/lib/agent/langgraph/tools";

function isLlmRequired() {
  const flag = process.env.LLM_REQUIRE?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function planToMessages(
  plan: ReturnType<typeof buildMockPlan>,
  toolCallId: string,
): Partial<DfcAgentStateType> {
  if (plan.action === "answer") {
    return {
      finalAnswer: plan.answer,
      shouldEnd: true,
      messages: [new AIMessage({ content: plan.answer })],
    };
  }

  let toolName = plan.tool;
  let toolArgs = plan.args;
  if (toolName === "execute_sql") {
    toolName = "propose_sql";
    toolArgs = {
      sql: String(plan.args.sql ?? ""),
      explanation: String(plan.args.explanation ?? "请确认后执行"),
    };
  }

  return {
    messages: [
      new AIMessage({
        content: plan.reasoning,
        tool_calls: [
          {
            id: toolCallId,
            name: toolName,
            args: toolArgs,
          },
        ],
      }),
    ],
  };
}

export async function mockPlanNode(
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
): Promise<Partial<DfcAgentStateType>> {
  const plan = buildMockPlan(state.userMessage, state.priorToolResults, conversation);
  const toolCallId = `mock_${state.stepCount + 1}`;
  return {
    mock: true,
    stepCount: state.stepCount + 1,
    ...planToMessages(plan, toolCallId),
  };
}

export async function llmAgentNode(
  state: DfcAgentStateType,
): Promise<Partial<DfcAgentStateType>> {
  let update: Partial<DfcAgentStateType> = {};
  for await (const event of streamLlmAgentNode(state)) {
    if (event.kind === "done") {
      update = event.update;
    }
  }
  return update;
}

function extractMessageChunkText(chunk: AIMessageChunk) {
  if (typeof chunk.content === "string") {
    return chunk.content;
  }
  if (Array.isArray(chunk.content)) {
    return chunk.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String(part.text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function buildAgentUpdateFromResponse(
  state: DfcAgentStateType,
  response: AIMessage,
): Partial<DfcAgentStateType> {
  return {
    mock: false,
    stepCount: state.stepCount + 1,
    messages: [response],
    finalAnswer:
      !response.tool_calls?.length && typeof response.content === "string"
        ? response.content
        : null,
    shouldEnd: !response.tool_calls?.length,
  };
}

export async function* streamLlmAgentNode(
  state: DfcAgentStateType,
): AsyncGenerator<
  | { kind: "delta"; text: string; delta: string }
  | { kind: "done"; update: Partial<DfcAgentStateType> }
> {
  const model = createChatModel().bindTools(createLangChainTools());
  const stream = await model.stream([
    new SystemMessage(buildAgentSystemPrompt(state.userMessage)),
    ...state.messages,
  ]);

  let gathered: AIMessageChunk | undefined;
  let text = "";

  for await (const chunk of stream) {
    gathered = gathered ? gathered.concat(chunk) : chunk;
    const delta = extractMessageChunkText(chunk);
    if (delta) {
      text += delta;
      yield { kind: "delta", text, delta };
    }
  }

  const response = (gathered ?? new AIMessage({ content: "" })) as AIMessage;
  yield {
    kind: "done",
    update: buildAgentUpdateFromResponse(state, response),
  };
}

export async function* streamRoutePlannerNode(
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
): AsyncGenerator<
  | { kind: "delta"; text: string; delta: string }
  | { kind: "done"; update: Partial<DfcAgentStateType> }
> {
  if (!isLangGraphLlmEnabled()) {
    if (isLlmRequired()) {
      yield {
        kind: "done",
        update: {
          mock: true,
          shouldEnd: true,
          finalAnswer:
            "LLM 规划器不可用：未配置 LLM。请联系管理员检查 Ollama/API 配置，或暂时关闭 LLM_REQUIRE。",
          messages: [],
        },
      };
      return;
    }

    yield { kind: "delta", text: "规则规划器分析中…", delta: "规则规划器分析中…" };
    const update = await mockPlanNode(state, conversation);
    yield { kind: "done", update: { mock: true, ...update } };
    return;
  }

  try {
    yield* streamLlmAgentNode(state);
  } catch {
    if (isLlmRequired()) {
      yield {
        kind: "done",
        update: {
          mock: true,
          shouldEnd: true,
          finalAnswer: "LLM 规划器不可用：调用失败。",
          messages: [],
        },
      };
      return;
    }
    yield { kind: "delta", text: "LLM 不可用，回退规则规划…", delta: "LLM 不可用，回退规则规划…" };
    const update = await mockPlanNode(state, conversation);
    yield { kind: "done", update: { mock: true, ...update } };
  }
}

export async function routePlannerNode(
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
): Promise<Partial<DfcAgentStateType>> {
  if (!isLangGraphLlmEnabled()) {
    if (isLlmRequired()) {
      return {
        mock: true,
        shouldEnd: true,
        finalAnswer:
          "LLM 规划器不可用：未配置 LLM。请联系管理员检查 Ollama/API 配置，或暂时关闭 LLM_REQUIRE。",
        messages: [],
      };
    }
    return mockPlanNode(state, conversation);
  }

  try {
    return await llmAgentNode(state);
  } catch {
    if (isLlmRequired()) {
      return {
        mock: true,
        shouldEnd: true,
        finalAnswer: "LLM 规划器不可用：调用失败。",
        messages: [],
      };
    }
    return mockPlanNode(state, conversation);
  }
}

export function postToolsNode(state: DfcAgentStateType): Partial<DfcAgentStateType> {
  const lastMessage = state.messages.at(-1);
  if (!(lastMessage instanceof ToolMessage)) {
    return {};
  }

  const priorEntry = state.priorToolResults.at(-1);
  if (priorEntry?.tool === "propose_sql" && priorEntry.data) {
    const data = priorEntry.data as { sql: string; explanation: string };
    return {
      pendingSql: {
        sql: data.sql,
        explanation: data.explanation,
      },
      shouldEnd: true,
    };
  }

  if (state.stepCount >= getAgentMaxSteps()) {
    return {
      shouldEnd: true,
      finalAnswer: buildExhaustedFromPrior(state.priorToolResults, getAgentMaxSteps()),
    };
  }

  return { shouldEnd: false };
}

function buildExhaustedFromPrior(prior: AgentToolResult[], maxSteps: number) {
  if (!prior.length) {
    return `已达最大步数（${maxSteps}），请缩小问题范围后重试。`;
  }
  const context = prior.map((item) => `${item.tool}: ${item.output}`).join("\n");
  return `已达最大步数（${maxSteps}）。基于已有工具结果：\n${context}\n\n请缩小问题范围后重试。`;
}

export function shouldUseTools(state: DfcAgentStateType): "tools" | "post_tools" | "__end__" {
  if (state.shouldEnd) {
    return "__end__";
  }

  const lastMessage = state.messages.at(-1);
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
    return "tools";
  }

  return "__end__";
}

export function afterToolsRoute(state: DfcAgentStateType): "agent" | "__end__" {
  if (state.shouldEnd || state.pendingSql) {
    return "__end__";
  }
  if (state.stepCount >= getAgentMaxSteps()) {
    return "__end__";
  }
  return "agent";
}

export function buildInitialMessages(
  userMessage: string,
  conversation: ThreadTurn[],
): BaseMessage[] {
  const messages: BaseMessage[] = [];
  for (const turn of conversation.slice(-10)) {
    if (turn.role === "user") {
      messages.push(new HumanMessage(turn.content));
    } else {
      messages.push(new AIMessage(turn.content));
    }
  }
  if (!messages.length || !(messages.at(-1) instanceof HumanMessage)) {
    messages.push(new HumanMessage(userMessage));
  }
  return messages;
}

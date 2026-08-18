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
import {
  createChatModel,
  describeLlmFailure,
  isLangGraphLlmEnabled,
} from "@/lib/agent/langgraph/model";
import type { LlmProvider } from "@/lib/llm-providers-catalog";
import { buildAgentSystemPrompt } from "@/lib/agent/langgraph/prompts";
import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createLangChainTools } from "@/lib/agent/langgraph/tools";

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

export function agentPlanToStateUpdate(
  plan: ReturnType<typeof buildMockPlan>,
  toolCallId: string,
  stepCount: number,
): Partial<DfcAgentStateType> {
  return {
    mock: true,
    stepCount: stepCount + 1,
    ...planToMessages(plan, toolCallId),
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

function llmUnavailableUpdate(error?: unknown, provider?: LlmProvider) {
  return {
    mock: false,
    shouldEnd: true,
    finalAnswer: describeLlmFailure(error, provider),
    messages: [],
  };
}

export async function llmAgentNode(
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
  provider?: LlmProvider,
): Promise<Partial<DfcAgentStateType>> {
  if (!isLangGraphLlmEnabled(provider)) {
    return llmUnavailableUpdate(undefined, provider);
  }

  try {
    let update: Partial<DfcAgentStateType> = {};
    for await (const event of streamLlmAgentNode(state, provider)) {
      if (event.kind === "done") {
        update = event.update;
      }
    }

    if (needsRuleBasedFallback(update, state, conversation)) {
      return llmUnavailableUpdate(
        new Error("模型未返回可用规划（无工具调用且无文本）"),
        provider,
      );
    }

    return update;
  } catch (error) {
    return llmUnavailableUpdate(error, provider);
  }
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

function extractAiText(response: AIMessage) {
  if (typeof response.content === "string") {
    return response.content.trim();
  }
  if (Array.isArray(response.content)) {
    return response.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String(part.text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export function needsRuleBasedFallback(
  update: Partial<DfcAgentStateType>,
  _state?: DfcAgentStateType,
  _conversation: ThreadTurn[] = [],
): boolean {
  const lastAi = update.messages?.at(-1);
  if (lastAi instanceof AIMessage && lastAi.tool_calls?.length) {
    return false;
  }

  const text = String(
    update.finalAnswer ??
      (lastAi instanceof AIMessage ? extractAiText(lastAi) : ""),
  ).trim();

  // 模型已给出规划（工具或文本）时不再切规则；仅空响应视为调用异常
  return !text;
}

export function shouldContinueWithMockPlanner(
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
) {
  if (state.priorToolResults.length === 0) {
    return false;
  }

  if (state.stepCount >= getAgentMaxSteps()) {
    return false;
  }

  const plan = buildMockPlan(state.userMessage, state.priorToolResults, conversation);
  return plan.action === "tool" || plan.action === "answer";
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toolCallsFromStreamedMessage(chunk: AIMessageChunk): NonNullable<AIMessage["tool_calls"]> {
  if (Array.isArray(chunk.tool_calls) && chunk.tool_calls.length) {
    return chunk.tool_calls;
  }

  const fromKwargs = chunk.additional_kwargs?.tool_calls;
  if (Array.isArray(fromKwargs) && fromKwargs.length) {
    return fromKwargs.map((item, index) => {
      const fn = (
        item as {
          id?: string;
          name?: string;
          function?: { name?: string; arguments?: string };
        }
      );
      return {
        id: String(fn.id ?? `call_${index}`),
        name: String(fn.function?.name ?? fn.name ?? ""),
        args: parseToolArgs(fn.function?.arguments),
        type: "tool_call" as const,
      };
    }).filter((item) => item.name);
  }

  const parts = chunk.tool_call_chunks ?? [];
  if (!parts.length) {
    return [];
  }

  const byIndex = new Map<number, { id?: string; name?: string; args: string }>();
  for (const part of parts) {
    const index = part.index ?? 0;
    const current = byIndex.get(index) ?? { args: "" };
    byIndex.set(index, {
      id: part.id ?? current.id,
      name: part.name ?? current.name,
      args: `${current.args}${part.args ?? ""}`,
    });
  }

  return [...byIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, part], index) => ({
      id: part.id || `call_${index}`,
      name: part.name || "",
      args: parseToolArgs(part.args),
      type: "tool_call" as const,
    }))
    .filter((item) => item.name);
}

function finalizeStreamedAiMessage(gathered: AIMessageChunk | undefined): AIMessage {
  if (!gathered) {
    return new AIMessage({ content: "" });
  }

  const toolCalls = toolCallsFromStreamedMessage(gathered);
  return new AIMessage({
    content: gathered.content,
    tool_calls: toolCalls.length ? toolCalls : undefined,
    additional_kwargs: gathered.additional_kwargs,
    response_metadata: gathered.response_metadata,
    id: gathered.id,
  });
}

function buildAgentUpdateFromResponse(
  state: DfcAgentStateType,
  response: AIMessage,
): Partial<DfcAgentStateType> {
  const contentText = extractAiText(response);
  const hasTools = Boolean(response.tool_calls?.length);

  return {
    mock: false,
    stepCount: state.stepCount + 1,
    messages: [response],
    finalAnswer: !hasTools && contentText ? contentText : null,
    shouldEnd: !hasTools && Boolean(contentText),
  };
}

export async function* streamLlmAgentNode(
  state: DfcAgentStateType,
  provider?: LlmProvider,
): AsyncGenerator<
  | { kind: "delta"; text: string; delta: string }
  | { kind: "done"; update: Partial<DfcAgentStateType> }
> {
  const model = createChatModel(provider).bindTools(await createLangChainTools());
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

  yield {
    kind: "done",
    update: buildAgentUpdateFromResponse(state, finalizeStreamedAiMessage(gathered)),
  };
}

export async function* streamRoutePlannerNode(
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
  provider?: LlmProvider,
): AsyncGenerator<
  | { kind: "delta"; text: string; delta: string }
  | { kind: "done"; update: Partial<DfcAgentStateType> }
  | { kind: "fail"; message: string }
> {
  if (!isLangGraphLlmEnabled(provider)) {
    yield { kind: "fail", message: describeLlmFailure(undefined, provider) };
    return;
  }

  try {
    let llmUpdate: Partial<DfcAgentStateType> = {};
    for await (const event of streamLlmAgentNode(state, provider)) {
      if (event.kind === "delta") {
        yield event;
      } else {
        llmUpdate = event.update;
      }
    }

    if (needsRuleBasedFallback(llmUpdate, state, conversation)) {
      yield {
        kind: "fail",
        message: describeLlmFailure(
          new Error("模型未返回可用规划（无工具调用且无文本）"),
          provider,
        ),
      };
      return;
    }

    yield { kind: "done", update: llmUpdate };
  } catch (error) {
    yield { kind: "fail", message: describeLlmFailure(error, provider) };
  }
}

export async function routePlannerNode(
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
  provider?: LlmProvider,
): Promise<Partial<DfcAgentStateType>> {
  return llmAgentNode(state, conversation, provider);
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

export function buildAgentExhaustedAnswer(prior: AgentToolResult[], maxSteps: number) {
  return buildExhaustedFromPrior(prior, maxSteps);
}

export function shouldUseTools(state: DfcAgentStateType): "tools" | "post_tools" | "__end__" {
  const lastMessage = state.messages.at(-1);
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
    return "tools";
  }

  if (state.shouldEnd && state.finalAnswer?.trim()) {
    return "__end__";
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

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
  isForcedToolChoiceRejection,
  isLangGraphLlmEnabled,
  markForcedToolChoiceUnsupported,
  supportsForcedToolChoice,
} from "@/lib/agent/langgraph/model";
import type { LlmProvider } from "@/lib/llm-providers-catalog";
import { buildAgentSystemPrompt } from "@/lib/agent/langgraph/prompts";
import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createLangChainTools } from "@/lib/agent/langgraph/tools";
import { streamWithLlmRetry } from "@/lib/agent/llm-retry";
import { estimateTokens, trimMessagesToBudget } from "@/lib/agent/context-budget";

export type PlannerNodeOptions = {
  userId?: string;
  signal?: AbortSignal;
};

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

function hasQueryableToolResults(prior: AgentToolResult[]) {
  for (const item of prior) {
    if (item.tool === "execute_sql") {
      const data = item.data as { rows?: unknown[] } | undefined;
      if (Array.isArray(data?.rows) && data.rows.length > 0) {
        return true;
      }
    }
    if (item.tool === "call_backend_api") {
      const data = item.data as
        | { status?: string; table?: { rows?: unknown[] } }
        | undefined;
      if (data?.status === "success" && (data.table?.rows?.length ?? 0) > 0) {
        return true;
      }
    }
  }
  return false;
}

/** LLM 只输出说明文字、未调工具，但规则规划器仍知下一步时应切规则 */
export function shouldOverridePrematureLlmAnswer(
  update: Partial<DfcAgentStateType>,
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
): boolean {
  const lastAi = update.messages?.at(-1);
  if (!(lastAi instanceof AIMessage) || lastAi.tool_calls?.length) {
    return false;
  }

  const text = String(
    update.finalAnswer ?? extractAiText(lastAi),
  ).trim();
  if (!text) {
    return false;
  }

  if (state.pendingSql || hasQueryableToolResults(state.priorToolResults)) {
    return false;
  }

  const mockPlan = buildMockPlan(
    state.userMessage,
    state.priorToolResults,
    conversation,
  );
  return mockPlan.action === "tool";
}

export function resolvePrematureLlmOverrideUpdate(
  state: DfcAgentStateType,
  conversation: ThreadTurn[] = [],
): Partial<DfcAgentStateType> | null {
  const lastAi = state.messages.at(-1);
  if (!(lastAi instanceof AIMessage) || lastAi.tool_calls?.length) {
    return null;
  }

  const probe = {
    messages: [lastAi],
    finalAnswer: state.finalAnswer,
    shouldEnd: state.shouldEnd,
  };

  if (!shouldOverridePrematureLlmAnswer(probe, state, conversation)) {
    return null;
  }

  const mockPlan = buildMockPlan(
    state.userMessage,
    state.priorToolResults,
    conversation,
  );
  if (mockPlan.action !== "tool") {
    return null;
  }

  return agentPlanToStateUpdate(
    mockPlan,
    `override_${state.stepCount + 1}`,
    state.stepCount,
  );
}

export function applyPlannerOverride(
  state: DfcAgentStateType,
  override: Partial<DfcAgentStateType>,
): DfcAgentStateType {
  const baseMessages =
    state.messages.length && state.messages.at(-1) instanceof AIMessage
      ? state.messages.slice(0, -1)
      : state.messages;

  return {
    ...state,
    ...override,
    messages: [...baseMessages, ...(override.messages ?? [])],
    mock: override.mock ?? true,
    shouldEnd: override.shouldEnd ?? false,
    finalAnswer: override.finalAnswer ?? null,
  };
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

/**
 * 只在「还没有任何工具结果的第一步」强制调工具。
 * 拿到结果之后必须放开，否则模型没法收尾作答，会一直被逼着调工具直到步数耗尽。
 */
export function shouldForceToolCall(state: DfcAgentStateType) {
  if (state.priorToolResults.length > 0 || state.pendingSql) {
    return false;
  }
  return state.stepCount === 0;
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
  options: PlannerNodeOptions = {},
): AsyncGenerator<
  | { kind: "delta"; text: string; delta: string }
  | { kind: "done"; update: Partial<DfcAgentStateType> }
> {
  const tools = await createLangChainTools({ userId: options.userId });
  const systemPrompt = buildAgentSystemPrompt(state.userMessage);
  const trimmed = trimMessagesToBudget(state.messages, {
    reservedTokens: estimateTokens(systemPrompt),
  });
  const messages = [new SystemMessage(systemPrompt), ...trimmed.messages];

  let gathered: AIMessageChunk | undefined;
  let text = "";

  // 首步强制调工具，取代提示词里「禁止只输出说明文字」那条靠自觉的约束
  let forceTool = shouldForceToolCall(state) && supportsForcedToolChoice(provider);

  const openStream = async () => {
    const model = createChatModel(provider).bindTools(
      tools,
      forceTool ? { tool_choice: "any" } : undefined,
    );
    try {
      return await model.stream(messages);
    } catch (error) {
      if (forceTool && isForcedToolChoiceRejection(error)) {
        // 该 provider 不支持强制调用，退回普通模式并记住，后续不再尝试
        markForcedToolChoiceUnsupported(provider);
        forceTool = false;
        return createChatModel(provider).bindTools(tools).stream(messages);
      }
      throw error;
    }
  };

  const stream = streamWithLlmRetry(openStream, { signal: options.signal });

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
  options: PlannerNodeOptions = {},
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
    for await (const event of streamLlmAgentNode(state, provider, options)) {
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

    if (shouldOverridePrematureLlmAnswer(llmUpdate, state, conversation)) {
      const mockPlan = buildMockPlan(
        state.userMessage,
        state.priorToolResults,
        conversation,
      );
      if (mockPlan.action === "tool") {
        yield {
          kind: "done",
          update: agentPlanToStateUpdate(
            mockPlan,
            `override_${state.stepCount + 1}`,
            state.stepCount,
          ),
        };
        return;
      }
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

/** 历史会话可用的 token 预算：留出余量给本轮的规划与工具结果 */
const CONVERSATION_TOKEN_BUDGET = 4_000;

/**
 * 被挤出预算的早期轮次做抽取式摘要——只保留用户问过什么。
 * 用 LLM 生成摘要会与「减少调用次数」的目标冲突，这里零成本保住意图连续性。
 */
function summarizeDroppedTurns(turns: ThreadTurn[]): string | null {
  const questions = turns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => (text.length > 60 ? `${text.slice(0, 60)}…` : text));

  if (!questions.length) {
    return null;
  }

  const recent = questions.slice(-6);
  return [
    `（更早的 ${turns.length} 轮已省略，用户先前问过：）`,
    ...recent.map((text) => `- ${text}`),
  ].join("\n");
}

export function buildInitialMessages(
  userMessage: string,
  conversation: ThreadTurn[],
): BaseMessage[] {
  // 从最近一轮往回收，直到用满预算；替代原来固定 slice(-10) 的硬切
  let used = 0;
  let cutoff = conversation.length;
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const cost = estimateTokens(conversation[index]!.content) + 4;
    if (used + cost > CONVERSATION_TOKEN_BUDGET) {
      break;
    }
    used += cost;
    cutoff = index;
  }

  const messages: BaseMessage[] = [];
  const summary = summarizeDroppedTurns(conversation.slice(0, cutoff));
  if (summary) {
    messages.push(new HumanMessage(summary));
  }

  for (const turn of conversation.slice(cutoff)) {
    messages.push(
      turn.role === "user"
        ? new HumanMessage(turn.content)
        : new AIMessage(turn.content),
    );
  }

  if (!messages.length || !(messages.at(-1) instanceof HumanMessage)) {
    messages.push(new HumanMessage(userMessage));
  }
  return messages;
}

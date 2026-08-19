import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createLangChainTools, toolResultToPrior } from "@/lib/agent/langgraph/tools";
import type { AgentLoopGuard } from "@/lib/agent/loop-guard";
import { runWithSsoRequestContext } from "@/lib/security/sso-context";
import type { SsoCredentials } from "@/lib/security/sso-credentials";

type ToolCallLike = {
  id?: string;
  name: string;
  args?: unknown;
};

/** 将 ToolMessage 与 AI tool_calls 配对：优先 id，其次 name，再按顺序兜底 */
export function pairToolCallsWithMessages(
  toolCalls: ToolCallLike[],
  messages: unknown[],
): Array<{ call: ToolCallLike; message: ToolMessage }> {
  const toolMessages = messages.filter(
    (message): message is ToolMessage => message instanceof ToolMessage,
  );
  const used = new Set<number>();
  const pairs: Array<{ call: ToolCallLike; message: ToolMessage }> = [];

  for (let index = 0; index < toolMessages.length; index += 1) {
    const message = toolMessages[index]!;
    let callIndex = toolCalls.findIndex(
      (item, itemIndex) =>
        !used.has(itemIndex) && item.id && item.id === message.tool_call_id,
    );
    if (callIndex < 0 && message.name) {
      callIndex = toolCalls.findIndex(
        (item, itemIndex) => !used.has(itemIndex) && item.name === message.name,
      );
    }
    if (callIndex < 0) {
      callIndex = toolCalls.findIndex((_, itemIndex) => !used.has(itemIndex));
      if (callIndex < 0 && toolCalls[index] && !used.has(index)) {
        callIndex = index;
      }
    }
    if (callIndex < 0) {
      continue;
    }
    used.add(callIndex);
    pairs.push({ call: toolCalls[callIndex]!, message });
  }

  return pairs;
}

export type ToolsNodeOptions = {
  userId?: string;
  /** 单轮共享的循环护栏；不传则不做重复/预算拦截 */
  guard?: AgentLoopGuard;
};

export function createToolsNodeHandler(
  sso?: SsoCredentials | null,
  options: ToolsNodeOptions = {},
) {
  return async (state: DfcAgentStateType): Promise<Partial<DfcAgentStateType>> => {
    const aiMessage = state.messages.findLast(
      (message): message is AIMessage =>
        message instanceof AIMessage && Boolean(message.tool_calls?.length),
    );
    const toolCalls = aiMessage?.tool_calls ?? [];

    // 护栏在执行前拆分：被拦截的调用不进 ToolNode，直接合成一条引导性 ToolMessage。
    // 模型仍然收到每个 tool_call 对应的回复，消息序列保持完整。
    const admitted: typeof toolCalls = [];
    const blocked: Array<{ call: (typeof toolCalls)[number]; message: string }> = [];
    for (const call of toolCalls) {
      const verdict = options.guard?.admit(call.name, call.args) ?? { allowed: true };
      if (verdict.allowed) {
        admitted.push(call);
      } else {
        blocked.push({ call, message: verdict.message });
      }
    }

    let executedMessages: DfcAgentStateType["messages"] = [];
    if (admitted.length) {
      // 按 userId 构建工具表：管理员专属工具不会出现在非管理员的表里，
      // 因此并行 tool_calls 中的每一个都受 RBAC 约束，而不只是第一个
      const toolNode = new ToolNode(
        await createLangChainTools({ userId: options.userId }),
      );
      const scopedState: DfcAgentStateType = {
        ...state,
        messages: [
          ...state.messages.filter((message) => message !== aiMessage),
          new AIMessage({
            content: aiMessage?.content ?? "",
            tool_calls: admitted,
            id: aiMessage?.id,
          }),
        ],
      };
      const invoke = async () => toolNode.invoke(scopedState);
      const result = sso
        ? await runWithSsoRequestContext(sso, invoke)
        : await invoke();
      executedMessages = (result.messages ?? []) as DfcAgentStateType["messages"];
    }

    const blockedMessages = blocked.map(
      ({ call, message }) =>
        new ToolMessage({
          status: "error",
          content: message,
          name: call.name,
          tool_call_id: call.id ?? "",
        }),
    );

    const priorAdds: DfcAgentStateType["priorToolResults"] = [];
    for (const { call, message } of pairToolCallsWithMessages(
      admitted,
      executedMessages,
    )) {
      priorAdds.push(
        toolResultToPrior(
          call.name,
          (call.args ?? {}) as Record<string, unknown>,
          String(message.content),
        ),
      );
    }

    return {
      messages: [...executedMessages, ...blockedMessages],
      priorToolResults: priorAdds,
    };
  };
}

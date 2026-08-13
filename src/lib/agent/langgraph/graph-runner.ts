import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createLangChainTools, toolResultToPrior } from "@/lib/agent/langgraph/tools";
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

export function createToolsNodeHandler(sso?: SsoCredentials | null) {
  const toolNode = new ToolNode(createLangChainTools());

  return async (state: DfcAgentStateType): Promise<Partial<DfcAgentStateType>> => {
    const invoke = async () => toolNode.invoke(state);
    const result = sso
      ? await runWithSsoRequestContext(sso, invoke)
      : await invoke();
    const newMessages = (result.messages ?? []) as DfcAgentStateType["messages"];
    const priorAdds: DfcAgentStateType["priorToolResults"] = [];

    const aiMessage = state.messages.findLast(
      (message): message is AIMessage =>
        message instanceof AIMessage && Boolean(message.tool_calls?.length),
    );
    const toolCalls = aiMessage?.tool_calls ?? [];
    const pairs = pairToolCallsWithMessages(toolCalls, newMessages);

    for (const { call, message } of pairs) {
      priorAdds.push(
        toolResultToPrior(
          call.name,
          (call.args ?? {}) as Record<string, unknown>,
          String(message.content),
        ),
      );
    }

    return {
      messages: newMessages,
      priorToolResults: priorAdds,
    };
  };
}

import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

import type { DfcAgentStateType } from "@/lib/agent/langgraph/state";
import { createLangChainTools, toolResultToPrior } from "@/lib/agent/langgraph/tools";
import { runWithSsoRequestContext } from "@/lib/security/sso-context";
import type { SsoCredentials } from "@/lib/security/sso-credentials";

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

    for (const message of newMessages) {
      if (!(message instanceof ToolMessage)) {
        continue;
      }
      const call = toolCalls.find((item) => item.id === message.tool_call_id);
      if (!call) {
        continue;
      }
      priorAdds.push(
        toolResultToPrior(
          call.name,
          call.args as Record<string, unknown>,
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

import { ChatOpenAI } from "@langchain/openai";

import {
  describeLlmFailure,
  getLlmConfig,
  getLlmConfigForProvider,
  isLlmProviderConfigured,
} from "@/lib/llm-config";
import { getRequestLlmProvider } from "@/lib/llm-provider-context";
import {
  resolveDefaultLlmProvider,
  type LlmProvider,
} from "@/lib/llm-providers-catalog";

export { describeLlmFailure };

export function resolveLlmProvider(provider?: LlmProvider) {
  return provider ?? getRequestLlmProvider() ?? resolveDefaultLlmProvider();
}

export function isLangGraphLlmEnabled(provider?: LlmProvider) {
  const flag = process.env.LLM_DISABLED?.toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") {
    return false;
  }
  return isLlmProviderConfigured(resolveLlmProvider(provider));
}

/** Ollama / OpenAI 兼容 ChatModel，由请求级 provider 或 LLM_PROVIDER 切换 */
export function createChatModel(provider?: LlmProvider) {
  const { baseURL, apiKey, model } = getLlmConfigForProvider(
    resolveLlmProvider(provider),
  );
  return new ChatOpenAI({
    model,
    apiKey,
    temperature: 0.1,
    streaming: true,
    configuration: { baseURL: baseURL.replace(/\/$/, "") },
  });
}

export function getLlmProviderLabel() {
  const { label, model } = getLlmConfig();
  return `${label} · ${model}`;
}

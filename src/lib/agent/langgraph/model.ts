import { ChatOpenAI } from "@langchain/openai";

import { getLlmConfig, isLlmConfigured } from "@/lib/llm-config";

export function isLangGraphLlmEnabled() {
  return isLlmConfigured();
}

/** Ollama / OpenAI 兼容 ChatModel，由 LLM_PROVIDER 切换 */
export function createChatModel() {
  const { baseURL, apiKey, model } = getLlmConfig();
  return new ChatOpenAI({
    model,
    apiKey,
    temperature: 0.1,
    configuration: { baseURL: baseURL.replace(/\/$/, "") },
  });
}

export function getLlmProviderLabel() {
  const { label, model } = getLlmConfig();
  return `${label} · ${model}`;
}

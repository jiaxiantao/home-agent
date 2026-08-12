import { AsyncLocalStorage } from "node:async_hooks";

import { isKnownLlmProvider, type LlmProvider } from "@/lib/llm-providers-catalog";

const llmProviderStore = new AsyncLocalStorage<LlmProvider>();

export function parseLlmProvider(value: unknown): LlmProvider | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return isKnownLlmProvider(normalized) ? normalized : undefined;
}

export function runWithLlmProvider<T>(
  provider: LlmProvider | undefined,
  fn: () => T,
): T {
  if (!provider) {
    return fn();
  }
  return llmProviderStore.run(provider, fn);
}

export function getRequestLlmProvider() {
  return llmProviderStore.getStore();
}

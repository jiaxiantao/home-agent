import { isKnownLlmProvider, type LlmProvider } from "@/lib/llm-providers-catalog";

const STORAGE_KEY = "dfc-data-agent-llm-provider";

export function getStoredLlmProvider(): LlmProvider {
  if (typeof window === "undefined") {
    return "ollama";
  }

  const value = window.localStorage.getItem(STORAGE_KEY)?.trim().toLowerCase();
  if (value && isKnownLlmProvider(value)) {
    return value;
  }
  return "ollama";
}

export function storeLlmProvider(provider: LlmProvider) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, provider);
}

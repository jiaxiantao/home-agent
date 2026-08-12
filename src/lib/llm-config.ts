import { getRequestLlmProvider } from "@/lib/llm-provider-context";
import {
  getLlmProviderDefinition,
  isKnownLlmProvider,
  listLlmProviderDefinitions,
  resolveDefaultLlmProvider,
  type LlmProvider,
  type LlmProviderDefinition,
} from "@/lib/llm-providers-catalog";

export type { LlmProvider } from "@/lib/llm-providers-catalog";

export type LlmConfig = {
  provider: LlmProvider;
  baseURL: string;
  apiKey: string;
  model: string;
  label: string;
};

const placeholderKeys = new Set([
  "",
  "your-openai-compatible-api-key",
  "sk-your-key",
  "replace-me",
  "changeme",
]);

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isPlaceholderKey(value: string) {
  return placeholderKeys.has(value.toLowerCase());
}

function resolveProviderDefinition(providerInput?: string): LlmProviderDefinition {
  const candidate =
    providerInput ??
    getRequestLlmProvider() ??
    resolveDefaultLlmProvider();

  const definition = getLlmProviderDefinition(candidate);
  if (!definition) {
    return getLlmProviderDefinition("ollama")!;
  }
  return definition;
}

export function getLlmConfigForProvider(providerInput?: LlmProvider): LlmConfig {
  const definition = resolveProviderDefinition(providerInput);
  const baseURL = readEnv(definition.env.baseURL) || definition.defaultBaseURL;
  const model = readEnv(definition.env.model) || definition.defaultModel;
  let apiKey = readEnv(definition.env.apiKey);

  if (definition.id === "ollama") {
    apiKey = apiKey || "ollama";
  } else if (isPlaceholderKey(apiKey)) {
    throw new Error(`${definition.env.apiKey} is not configured`);
  }

  if (!apiKey) {
    throw new Error(`${definition.env.apiKey} is not configured`);
  }

  return {
    provider: definition.id,
    baseURL: baseURL.replace(/\/$/, ""),
    apiKey,
    model,
    label: definition.label,
  };
}

export function getLlmConfig(): LlmConfig {
  return getLlmConfigForProvider(getRequestLlmProvider());
}

function isLlmExplicitlyDisabled() {
  const flag = process.env.LLM_DISABLED?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function isLlmProviderConfigured(provider: LlmProvider) {
  if (isLlmExplicitlyDisabled()) {
    return false;
  }

  try {
    getLlmConfigForProvider(provider);
    return true;
  } catch {
    return false;
  }
}

export function isLlmConfigured() {
  return isLlmProviderConfigured(getLlmConfig().provider);
}

export function getLlmLabel() {
  const { label, model } = getLlmConfig();
  return `${label} · ${model}`;
}

export async function checkLlmHealthForProvider(provider: LlmProvider) {
  if (!isLlmProviderConfigured(provider)) {
    const definition = getLlmProviderDefinition(provider);
    return {
      configured: false,
      ok: false,
      latencyMs: 0,
      error: definition?.freeTier ? "未配置 API Key" : "not configured",
    };
  }

  const started = performance.now();
  const config = getLlmConfigForProvider(provider);

  try {
    const response = await fetch(`${config.baseURL}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      configured: true,
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      label: `${config.label} · ${config.model}`,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      label: `${config.label} · ${config.model}`,
      error: error instanceof Error ? error.message : "unreachable",
    };
  }
}

export async function checkLlmHealth(): Promise<{
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  label?: string;
  error?: string;
}> {
  return checkLlmHealthForProvider(getLlmConfig().provider);
}

export function listConfiguredLlmProviders() {
  return listLlmProviderDefinitions().map((definition) => ({
    ...definition,
    configured: isLlmProviderConfigured(definition.id),
  }));
}

export { isKnownLlmProvider, listLlmProviderDefinitions, getLlmProviderDefinition };

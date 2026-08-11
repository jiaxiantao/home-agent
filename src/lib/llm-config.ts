export type LlmProvider = "ollama" | "openai";

export type LlmConfig = {
  provider: LlmProvider;
  baseURL: string;
  apiKey: string;
  model: string;
};

const placeholderKeys = new Set([
  "",
  "your-openai-compatible-api-key",
  "sk-your-key",
]);

export function getLlmConfig(): LlmConfig {
  const provider = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase();

  if (provider === "ollama") {
    return {
      provider: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
      model: process.env.OLLAMA_MODEL ?? "qwen3",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY ?? "";

  if (placeholderKeys.has(apiKey)) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return {
    provider: "openai",
    baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  };
}

function isLlmExplicitlyDisabled() {
  const flag = process.env.LLM_DISABLED?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function isLlmConfigured() {
  if (isLlmExplicitlyDisabled()) {
    return false;
  }

  try {
    getLlmConfig();
    return true;
  } catch {
    return false;
  }
}

export function getLlmLabel() {
  const { provider, model } = getLlmConfig();
  return provider === "ollama" ? `Ollama · ${model}` : `OpenAI · ${model}`;
}

export async function checkLlmHealth(): Promise<{
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  label?: string;
  error?: string;
}> {
  if (!isLlmConfigured()) {
    return {
      configured: false,
      ok: false,
      latencyMs: 0,
      error: "disabled or misconfigured",
    };
  }

  const started = performance.now();

  try {
    const { baseURL, apiKey } = getLlmConfig();
    const response = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      configured: true,
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      label: getLlmLabel(),
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      label: getLlmLabel(),
      error: error instanceof Error ? error.message : "unreachable",
    };
  }
}

export type LlmProviderKind = "local" | "cloud";

export type LlmProviderDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  kind: LlmProviderKind;
  defaultBaseURL: string;
  defaultModel: string;
  /** .env 变量名 */
  env: {
    baseURL: string;
    apiKey: string;
    model: string;
  };
  signupUrl?: string;
  /** 标注为常见免费/赠金额度渠道，便于 UI 展示 */
  freeTier?: boolean;
};

export const LLM_PROVIDER_CATALOG: LlmProviderDefinition[] = [
  {
    id: "ollama",
    label: "本地模型",
    shortLabel: "本地",
    kind: "local",
    defaultBaseURL: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen3",
    env: {
      baseURL: "OLLAMA_BASE_URL",
      apiKey: "OLLAMA_API_KEY",
      model: "OLLAMA_MODEL",
    },
  },
  {
    id: "groq",
    label: "Groq 免费",
    shortLabel: "Groq",
    kind: "cloud",
    defaultBaseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    env: {
      baseURL: "GROQ_BASE_URL",
      apiKey: "GROQ_API_KEY",
      model: "GROQ_MODEL",
    },
    signupUrl: "https://console.groq.com/keys",
    freeTier: true,
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    shortLabel: "硅基",
    kind: "cloud",
    defaultBaseURL: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    env: {
      baseURL: "SILICONFLOW_BASE_URL",
      apiKey: "SILICONFLOW_API_KEY",
      model: "SILICONFLOW_MODEL",
    },
    signupUrl: "https://cloud.siliconflow.cn/account/ak",
    freeTier: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    kind: "cloud",
    defaultBaseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    env: {
      baseURL: "DEEPSEEK_BASE_URL",
      apiKey: "DEEPSEEK_API_KEY",
      model: "DEEPSEEK_MODEL",
    },
    signupUrl: "https://platform.deepseek.com/api_keys",
    freeTier: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter 免费",
    shortLabel: "OpenRouter",
    kind: "cloud",
    defaultBaseURL: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemma-2-9b-it:free",
    env: {
      baseURL: "OPENROUTER_BASE_URL",
      apiKey: "OPENROUTER_API_KEY",
      model: "OPENROUTER_MODEL",
    },
    signupUrl: "https://openrouter.ai/keys",
    freeTier: true,
  },
  {
    id: "openai",
    label: "OpenAI 官方",
    shortLabel: "OpenAI",
    kind: "cloud",
    defaultBaseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    env: {
      baseURL: "OPENAI_BASE_URL",
      apiKey: "OPENAI_API_KEY",
      model: "OPENAI_MODEL",
    },
    signupUrl: "https://platform.openai.com/api-keys",
  },
];

export type LlmProvider = (typeof LLM_PROVIDER_CATALOG)[number]["id"];

const providerIds = new Set(LLM_PROVIDER_CATALOG.map((item) => item.id));

export function isKnownLlmProvider(value: string): value is LlmProvider {
  return providerIds.has(value);
}

export function getLlmProviderDefinition(id: string) {
  return LLM_PROVIDER_CATALOG.find((item) => item.id === id);
}

export function listLlmProviderDefinitions(kind?: LlmProviderKind) {
  if (!kind) {
    return LLM_PROVIDER_CATALOG;
  }
  return LLM_PROVIDER_CATALOG.filter((item) => item.kind === kind);
}

export function resolveDefaultLlmProvider(): LlmProvider {
  const fromEnv = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (fromEnv && isKnownLlmProvider(fromEnv)) {
    return fromEnv;
  }
  return "ollama";
}

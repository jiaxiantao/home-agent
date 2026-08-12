import {
  checkLlmHealthForProvider,
  getLlmConfigForProvider,
  isLlmProviderConfigured,
} from "@/lib/llm-config";
import { listLlmProviderDefinitions } from "@/lib/llm-providers-catalog";

export async function GET() {
  const providers = await Promise.all(
    listLlmProviderDefinitions().map(async (definition) => {
      let model = definition.defaultModel;
      let configured = false;

      try {
        model = getLlmConfigForProvider(definition.id).model;
        configured = isLlmProviderConfigured(definition.id);
      } catch {
        configured = false;
      }

      const health = configured
        ? await checkLlmHealthForProvider(definition.id)
        : {
            ok: false,
            error: definition.freeTier ? "未配置 API Key" : "not configured",
          };

      return {
        id: definition.id,
        label: definition.label,
        shortLabel: definition.shortLabel,
        kind: definition.kind,
        model,
        configured,
        ok: health.ok,
        error: health.error,
        freeTier: definition.freeTier ?? false,
        signupUrl: definition.signupUrl,
      };
    }),
  );

  return Response.json({
    defaultProvider: "ollama" as const,
    providers,
  });
}

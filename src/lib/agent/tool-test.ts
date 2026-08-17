import { getManagedToolByName } from "@/lib/agent/managed-tools";
import { getDefaultTestArgs } from "@/lib/agent/tool-test-defaults";
import { runAgentTool } from "@/lib/agent/tools";
import type { AgentToolName } from "@/lib/agent/types";

export { getDefaultTestArgs } from "@/lib/agent/tool-test-defaults";

export type ToolTestResult = {
  name: string;
  label: string;
  ok: boolean;
  durationMs: number;
  output?: string;
  error?: string;
  warning?: string;
  data?: unknown;
};

const OUTPUT_LIMIT = 2400;

function truncate(text: string, limit = OUTPUT_LIMIT) {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n…（已截断）`;
}

function evaluateToolTestSuccess(
  toolName: string,
  output: string,
  data: unknown,
): { ok: boolean; warning?: string } {
  if (output.startsWith("未知工具：")) {
    return { ok: false };
  }

  if (toolName === "call_backend_api" && data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const status = String(record.status ?? "");
    if (status === "success") {
      return { ok: true };
    }
    if (status === "skipped") {
      return {
        ok: true,
        warning: "Dubbo 或非只读接口无法直连，目录与回退信息正常",
      };
    }
    if (status === "not_configured") {
      return { ok: false, warning: String(record.message ?? "上游未配置") };
    }
    return { ok: false, warning: String(record.message ?? "调用未成功") };
  }

  if (data && typeof data === "object" && "status" in (data as object)) {
    const status = String((data as Record<string, unknown>).status ?? "");
    if (status === "error") {
      return { ok: false };
    }
  }

  return { ok: true };
}

export async function testAgentTool(
  name: string,
  args?: Record<string, unknown>,
  options?: { allowExecuteSql?: boolean },
): Promise<ToolTestResult> {
  const trimmed = name.trim();
  const tool = await getManagedToolByName(trimmed);
  if (!tool) {
    return {
      name: trimmed,
      label: trimmed,
      ok: false,
      durationMs: 0,
      error: "工具不存在",
    };
  }

  if (!tool.enabled) {
    return {
      name: trimmed,
      label: tool.label,
      ok: false,
      durationMs: 0,
      error: "工具已停用",
    };
  }

  if (trimmed === "execute_sql" && !options?.allowExecuteSql) {
    return {
      name: trimmed,
      label: tool.label,
      ok: false,
      durationMs: 0,
      error: "execute_sql 为 HITL 工具，测试请勾选「允许执行 SQL」或使用 propose_sql",
    };
  }

  const testArgs = args ?? getDefaultTestArgs(trimmed, tool);
  const started = Date.now();

  try {
    const result = await runAgentTool(trimmed as AgentToolName, testArgs);
    const durationMs = Date.now() - started;
    const verdict = evaluateToolTestSuccess(trimmed, result.output, result.data);

    return {
      name: trimmed,
      label: tool.label,
      ok: verdict.ok,
      durationMs,
      output: truncate(result.output),
      warning: verdict.warning,
      data: result.data,
      error: verdict.ok ? undefined : verdict.warning ?? "测试未通过",
    };
  } catch (error) {
    return {
      name: trimmed,
      label: tool.label,
      ok: false,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testAgentToolsBatch(
  names: string[],
  options?: {
    args?: Record<string, unknown>;
    argsByName?: Record<string, Record<string, unknown>>;
    allowExecuteSql?: boolean;
    concurrency?: number;
  },
) {
  const unique = [...new Set(names.map((item) => item.trim()).filter(Boolean))];
  const concurrency = Math.min(Math.max(options?.concurrency ?? 3, 1), 6);
  const results: ToolTestResult[] = [];

  for (let index = 0; index < unique.length; index += concurrency) {
    const chunk = unique.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((name) =>
        testAgentTool(name, options?.argsByName?.[name] ?? options?.args, {
          allowExecuteSql: options?.allowExecuteSql,
        }),
      ),
    );
    results.push(...chunkResults);
  }

  return {
    total: unique.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}

function truthyEnv(value: string | undefined) {
  const flag = value?.toLowerCase().trim();
  return flag === "1" || flag === "true" || flag === "yes";
}

/**
 * Agent 是否必须经 MCP Client 调用中间件。
 * 默认开启（产品链路：LLM → MCP → 大风车）；显式 DFC_MCP_ENABLED=0 可关。
 * Vitest 默认关闭，避免单测拉起 MCP。
 */
export function isDfcMcpEnabled() {
  const raw = process.env.DFC_MCP_ENABLED;
  if (raw != null && raw.trim() !== "") {
    return truthyEnv(raw);
  }
  if (process.env.VITEST === "true") {
    return false;
  }
  return true;
}

/**
 * MCP 失败时是否允许同进程门面绕过中间件。
 * 默认关闭（禁止跳过 MCP）；仅排障时设 DFC_MCP_FALLBACK_LOCAL=1。
 */
export function isDfcMcpFallbackLocal() {
  const raw = process.env.DFC_MCP_FALLBACK_LOCAL;
  if (raw == null || raw.trim() === "") return false;
  return truthyEnv(raw);
}

/**
 * Agent 内默认 inprocess（InMemory MCP，可透传请求 SSO）。
 * Cursor 等外部宿主用 stdio：DFC_MCP_TRANSPORT=stdio。
 */
export function isDfcMcpInProcess() {
  const raw = process.env.DFC_MCP_TRANSPORT?.trim().toLowerCase();
  if (raw === "stdio" || raw === "subprocess") return false;
  if (raw === "inprocess" || raw === "memory") return true;
  return true;
}

export function getDfcMcpTimeoutMs() {
  const n = Number(process.env.DFC_MCP_TIMEOUT_MS ?? 20_000);
  return Number.isFinite(n) && n > 0 ? n : 20_000;
}

export function getDfcMcpLaunchConfig() {
  const command = process.env.DFC_MCP_COMMAND?.trim() || "pnpm";
  const argsRaw = process.env.DFC_MCP_ARGS?.trim();
  const args = argsRaw
    ? argsRaw.split(/\s+/).filter(Boolean)
    : ["exec", "tsx", "scripts/mcp-dfc-api/server.ts"];
  return { command, args };
}

export function assertDfcMcpPolicy() {
  if (!isDfcMcpEnabled() && !isDfcMcpFallbackLocal() && process.env.VITEST !== "true") {
    throw new Error(
      "DFC API 必须经 MCP 中间件调用：请设置 DFC_MCP_ENABLED=1，或仅在排障时临时 DFC_MCP_FALLBACK_LOCAL=1",
    );
  }
}

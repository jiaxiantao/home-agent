import type { ManagedMcpConfig } from "@/lib/agent/managed-tools";

/**
 * Invoke a tool on an external MCP Server via the Streamable HTTP transport.
 * Falls back to a simple JSON-RPC POST if the server doesn't support streaming.
 */
export async function invokeManagedMcpTool(
  config: ManagedMcpConfig,
  args: Record<string, unknown>,
): Promise<{ output: string; data?: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  }

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: config.toolName,
      arguments: args,
    },
  };

  const response = await fetch(config.serverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`MCP Server returned HTTP ${response.status}`);
  }

  const result = (await response.json()) as {
    result?: {
      content?: Array<{ type: string; text?: string; data?: unknown }>;
    };
    error?: { message: string };
  };

  if (result.error) {
    throw new Error(`MCP error: ${result.error.message}`);
  }

  const content = result.result?.content ?? [];
  const textParts = content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");

  return {
    output: textParts || JSON.stringify(result.result ?? {}),
    data: result.result as Record<string, unknown> | undefined,
  };
}

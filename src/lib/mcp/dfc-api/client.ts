import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  getDfcMcpLaunchConfig,
  getDfcMcpTimeoutMs,
  isDfcMcpInProcess,
} from "@/lib/mcp/dfc-api/config";
import { createDfcApiMcpServer } from "@/lib/mcp/dfc-api/create-server";
import type { DfcMcpToolName } from "@/lib/mcp/dfc-api/types";

type PendingConnect = {
  promise: Promise<Client>;
};

const globalMcp = globalThis as typeof globalThis & {
  __dfcApiMcpClient?: Client | null;
  __dfcApiMcpConnecting?: PendingConnect | null;
  __dfcApiMcpMode?: "inprocess" | "stdio" | null;
};

function buildChildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

async function connectInProcessClient(): Promise<Client> {
  const server = createDfcApiMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "home-agent", version: "0.4.5" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

async function connectStdioClient(): Promise<Client> {
  const { command, args } = getDfcMcpLaunchConfig();
  const transport = new StdioClientTransport({
    command,
    args,
    cwd: process.cwd(),
    env: buildChildEnv(),
    stderr: "pipe",
  });

  const stderr = transport.stderr;
  if (stderr) {
    stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) {
        // eslint-disable-next-line no-console -- MCP child diagnostics
        console.error(`[dfc-api-mcp:child] ${text}`);
      }
    });
  }

  const client = new Client({ name: "home-agent", version: "0.4.5" });
  await client.connect(transport);
  return client;
}

async function connectClient(): Promise<Client> {
  const mode = isDfcMcpInProcess() ? "inprocess" : "stdio";
  globalMcp.__dfcApiMcpMode = mode;
  if (mode === "inprocess") {
    // eslint-disable-next-line no-console -- transport mode
    console.error("[dfc-api-mcp] using in-process MCP (SSO ALS + args)");
    return connectInProcessClient();
  }
  // eslint-disable-next-line no-console -- transport mode
  console.error("[dfc-api-mcp] using stdio MCP subprocess");
  return connectStdioClient();
}

export async function getDfcApiMcpClient(): Promise<Client> {
  const desired = isDfcMcpInProcess() ? "inprocess" : "stdio";
  if (globalMcp.__dfcApiMcpClient && globalMcp.__dfcApiMcpMode === desired) {
    return globalMcp.__dfcApiMcpClient;
  }
  if (globalMcp.__dfcApiMcpClient && globalMcp.__dfcApiMcpMode !== desired) {
    await closeDfcApiMcpClient();
  }
  if (globalMcp.__dfcApiMcpConnecting) {
    return globalMcp.__dfcApiMcpConnecting.promise;
  }

  const promise = connectClient()
    .then((client) => {
      globalMcp.__dfcApiMcpClient = client;
      globalMcp.__dfcApiMcpConnecting = null;
      return client;
    })
    .catch((error) => {
      globalMcp.__dfcApiMcpConnecting = null;
      globalMcp.__dfcApiMcpClient = null;
      globalMcp.__dfcApiMcpMode = null;
      throw error;
    });

  globalMcp.__dfcApiMcpConnecting = { promise };
  return promise;
}

export async function closeDfcApiMcpClient() {
  const client = globalMcp.__dfcApiMcpClient;
  globalMcp.__dfcApiMcpClient = null;
  globalMcp.__dfcApiMcpConnecting = null;
  globalMcp.__dfcApiMcpMode = null;
  if (client) {
    await client.close().catch(() => undefined);
  }
}

function parseStructuredContent(result: {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}): unknown {
  if (result.structuredContent != null) {
    return result.structuredContent;
  }
  const textBlock = result.content?.find((item) => item.type === "text" && item.text);
  if (textBlock?.text) {
    try {
      return JSON.parse(textBlock.text);
    } catch {
      return { text: textBlock.text };
    }
  }
  return null;
}

export async function callDfcMcpTool<T = unknown>(
  name: DfcMcpToolName,
  args: Record<string, unknown> = {},
): Promise<T> {
  const client = await getDfcApiMcpClient();
  const timeoutMs = getDfcMcpTimeoutMs();

  const result = await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: timeoutMs },
  );

  if ("isError" in result && result.isError) {
    const message =
      Array.isArray(result.content) &&
      result.content[0] &&
      typeof result.content[0] === "object" &&
      "text" in result.content[0]
        ? String((result.content[0] as { text?: string }).text)
        : `MCP tool ${name} failed`;
    throw new Error(message);
  }

  return parseStructuredContent(result as {
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  }) as T;
}

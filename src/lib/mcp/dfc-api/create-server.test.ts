import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createDfcApiMcpServer } from "@/lib/mcp/dfc-api/create-server";

describe("dfc api mcp server", () => {
  it("lists tools and returns catalog stats", async () => {
    const server = createDfcApiMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        "dfc_call_http_api",
        "dfc_catalog_stats",
        "dfc_get_api",
        "dfc_route_api",
        "dfc_search_apis",
      ].sort(),
    );

    const result = await client.callTool({
      name: "dfc_catalog_stats",
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as {
      catalogSize?: number;
    } | null;
    expect(structured?.catalogSize).toBeGreaterThan(1000);

    await client.close();
    await server.close();
  });
});

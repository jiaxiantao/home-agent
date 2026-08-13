import "dotenv/config";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createDfcApiMcpServer } from "../../src/lib/mcp/dfc-api/create-server";

async function main() {
  const server = createDfcApiMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[dfc-api-mcp] stdio server ready");
}

main().catch((error) => {
  console.error("[dfc-api-mcp] fatal", error);
  process.exit(1);
});

import { loadProjectEnv } from "../load-project-env.mjs";

loadProjectEnv();

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createDfcApiMcpServer } from "../../src/lib/mcp/dfc-api/create-server";
import { ensureDfcApiCatalogFromDatabase } from "../../src/lib/analytics/dfc-api-endpoints";

async function main() {
  await ensureDfcApiCatalogFromDatabase();
  const server = createDfcApiMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[dfc-api-mcp] stdio server ready");
}

main().catch((error) => {
  console.error("[dfc-api-mcp] fatal", error);
  process.exit(1);
});

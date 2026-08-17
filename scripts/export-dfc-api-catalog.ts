import { loadProjectEnv } from "./load-project-env.mjs";

loadProjectEnv();

import {
  defaultCatalogJsonPath,
  writeCatalogJsonFile,
} from "../src/lib/analytics/dfc-api-catalog-json";
import { exportDfcApiEndpointsFromDatabase } from "../src/lib/analytics/dfc-api-endpoints";

function parseOutPath() {
  const arg = process.argv.slice(2).find((item) => item.startsWith("--out="));
  return arg?.slice("--out=".length)?.trim() || defaultCatalogJsonPath();
}

async function main() {
  const outPath = parseOutPath();
  const endpoints = await exportDfcApiEndpointsFromDatabase();
  const payload = writeCatalogJsonFile(endpoints, outPath);
  console.log(`Exported ${endpoints.length} endpoints to ${outPath}`);
  console.log(`Stats: ${JSON.stringify(payload.stats)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

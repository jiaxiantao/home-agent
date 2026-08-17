import { loadProjectEnv } from "./load-project-env.mjs";

loadProjectEnv();
import { execSync } from "node:child_process";

import {
  defaultCatalogJsonPath,
  loadDfcApiCatalogFromJsonFile,
} from "../src/lib/analytics/dfc-api-catalog-json";
import {
  countMysqlDfcApiEndpoints,
  ensureDfcApiEndpointsTable,
} from "../src/lib/analytics/dfc-api-endpoints-mysql";
import { syncDfcApiEndpointsToDatabase } from "../src/lib/analytics/dfc-api-endpoints";

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    generate: args.includes("--generate"),
    file: args.find((arg) => arg.startsWith("--file="))?.slice("--file=".length),
  };
}

async function main() {
  const { generate, file } = parseArgs();
  const jsonPath = file?.trim() || defaultCatalogJsonPath();

  if (generate) {
    console.log("Running pnpm generate:api-catalog …");
    execSync("pnpm generate:api-catalog", { stdio: "inherit" });
  }

  await ensureDfcApiEndpointsTable();
  const before = await countMysqlDfcApiEndpoints();
  const catalog = loadDfcApiCatalogFromJsonFile(jsonPath);
  console.log(`Loaded ${catalog.length} endpoints from ${jsonPath}`);

  const affected = await syncDfcApiEndpointsToDatabase(catalog);
  const after = await countMysqlDfcApiEndpoints();
  console.log(
    `Synced dfc_api_endpoints: ${before} -> ${after} rows (${affected} write ops)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

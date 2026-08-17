import { loadProjectEnv } from "./load-project-env.mjs";

loadProjectEnv();

import {
  ensureDfcApiEndpointsTable,
  listAllMysqlDfcApiEndpoints,
} from "../src/lib/analytics/dfc-api-endpoints-mysql";
import { inferDefaultTestConfig } from "../src/lib/analytics/dfc-api-test-config";
import { executeAppMysql } from "../src/lib/app-mysql/client";

async function main() {
  await ensureDfcApiEndpointsTable();
  const records = await listAllMysqlDfcApiEndpoints();
  console.log(`Backfilling test config for ${records.length} endpoints …`);

  const chunkSize = 100;
  let updated = 0;

  for (let index = 0; index < records.length; index += chunkSize) {
    const chunk = records.slice(index, index + chunkSize);
    for (const record of chunk) {
      const config = inferDefaultTestConfig(record.endpoint);
      await executeAppMysql(
        `UPDATE dfc_api_endpoints
         SET default_test_params_json = ?, default_test_config_json = ?, updated_at = ?
         WHERE id = ?`,
        [JSON.stringify(config.params), JSON.stringify(config), new Date(), record.id],
      );
      updated += 1;
    }
    console.log(`  ${Math.min(index + chunkSize, records.length)} / ${records.length}`);
  }

  console.log(`Done. Updated ${updated} rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

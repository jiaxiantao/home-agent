import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** CLI / MCP 脚本：加载 .env + config/dfc-api.env（及可选 local 覆盖） */
export function loadProjectEnv() {
  loadDotenv({ path: path.join(ROOT, ".env") });
  for (const name of ["dfc-api.env", "dfc-api.local.env"]) {
    const file = path.join(ROOT, "config", name);
    if (!fs.existsSync(file)) {
      continue;
    }
    loadDotenv({ path: file, override: name === "dfc-api.local.env" });
  }
}

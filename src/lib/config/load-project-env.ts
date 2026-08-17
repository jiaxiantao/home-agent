import fs from "node:fs";
import path from "node:path";

import { config as loadDotenv } from "dotenv";

const loaded = { project: false, dfcApi: false };

function projectRoot() {
  return process.cwd();
}

/** 加载 config/dfc-api.env（及可选的 config/dfc-api.local.env 覆盖） */
export function loadDfcApiEnv(options?: { override?: boolean }) {
  if (loaded.dfcApi && !options?.override) {
    return;
  }
  const configDir = path.join(projectRoot(), "config");
  const files = ["dfc-api.env", "dfc-api.local.env"];
  for (const name of files) {
    const file = path.join(configDir, name);
    if (!fs.existsSync(file)) {
      continue;
    }
    loadDotenv({
      path: file,
      override: name === "dfc-api.local.env" ? true : (options?.override ?? false),
    });
  }
  loaded.dfcApi = true;
}

/** 加载 .env + config/dfc-api.env（CLI / MCP 脚本用） */
export function loadProjectEnv() {
  if (!loaded.project) {
    loadDotenv({ path: path.join(projectRoot(), ".env") });
    loaded.project = true;
  }
  loadDfcApiEnv();
}

#!/usr/bin/env node
/**
 * 根据 registry + 接口目录生成 config/dfc-api.env，并补丁 catalog 的 baseUrlEnvKey
 *
 *   pnpm generate:dfc-api-env
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REGISTRY = path.join(ROOT, "config/dfc-app-registry.json");
const CATALOG = path.join(ROOT, "config/dfc-api-catalog.json");
const OUT = path.join(ROOT, "config/dfc-api.env");

/** 与 src/lib/analytics/dfc-app-registry.ts 保持一致 */
const APP_TEST_HOST_HINTS = {
  "super-mario": "http://super-mario.stable.dasouche.net",
  "crazyracing-kartrider": "https://crazyracing-kartrider.stable.dasouche.net",
  matador: "http://matador.dasouche.net",
};

function inferBaseUrlEnvKey(appCode, registry) {
  return (
    registry.apps[appCode]?.baseUrlEnvKey ??
    `DFC_API_${appCode.replace(/-/g, "_").toUpperCase()}_BASE_URL`
  );
}

function resolveTestBaseUrl(appCode) {
  return APP_TEST_HOST_HINTS[appCode] ?? `https://${appCode}.dasouche.net`;
}

function collectAppCodes(registry, catalog) {
  const codes = new Set(Object.keys(registry.apps ?? {}));
  if (catalog?.endpoints) {
    for (const endpoint of catalog.endpoints) {
      if (endpoint.appCode) {
        codes.add(endpoint.appCode);
      }
    }
  }
  return [...codes].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function patchCatalogBaseUrlKeys(registry, catalog) {
  if (!catalog?.endpoints) {
    return 0;
  }
  let patched = 0;
  for (const endpoint of catalog.endpoints) {
    const expected = inferBaseUrlEnvKey(endpoint.appCode, registry);
    if (endpoint.baseUrlEnvKey !== expected) {
      endpoint.baseUrlEnvKey = expected;
      patched++;
    }
  }
  if (patched > 0) {
    catalog.generatedAt = new Date().toISOString();
    fs.writeFileSync(CATALOG, JSON.stringify(catalog));
  }
  return patched;
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  let catalog = null;
  if (fs.existsSync(CATALOG)) {
    catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  }

  const appCodes = collectAppCodes(registry, catalog);
  const lines = [
    "# 大风车后端 HTTP 接口（测试环境 *.dasouche.net；线上才是 *.souche.com）",
    "# 由 pnpm generate:dfc-api-env 根据 registry + 接口目录生成，可手工覆盖",
    "# SSO：侧栏「同步大风车登录」或 .env 中的 DFC_API_DEV_SSO_TOKEN",
    "",
    "DFC_API_ENABLED=1",
    "",
  ];

  for (const appCode of appCodes) {
    const envKey = inferBaseUrlEnvKey(appCode, registry);
    lines.push(`${envKey}=${resolveTestBaseUrl(appCode)}`);
  }

  lines.push(
    "",
    "# DFC_API_GATEWAY_BASE_URL=https://gateway-test.example.internal",
    "# DFC_API_DEV_SSO_TOKEN=",
    "# DFC_API_SERVICE_CHAIN=",
    "# DFC_API_TIMEOUT_MS=12000",
    "",
  );

  fs.writeFileSync(OUT, lines.join("\n"));

  let catalogPatched = 0;
  if (catalog) {
    catalogPatched = patchCatalogBaseUrlKeys(registry, catalog);
  }

  console.log(`Wrote ${OUT} (${appCodes.length} services)`);
  if (catalog) {
    console.log(`Patched catalog baseUrlEnvKey on ${catalogPatched} endpoints`);
  }
}

main();

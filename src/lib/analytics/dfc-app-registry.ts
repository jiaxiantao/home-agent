import fs from "node:fs";
import path from "node:path";

import { inferDefaultBaseUrlForApp } from "@/lib/analytics/backend-api-client";

export type DfcAppRegistryEntry = {
  repo: string;
  database: string;
  baseUrlEnvKey: string;
};

export type DfcAppRegistryFile = {
  comment?: string;
  apps: Record<string, DfcAppRegistryEntry>;
  defaultAppMeta?: {
    baseUrlEnvKey: string;
  };
};

/** 测试环境常见 host（无 env 时在表单中展示；实际请求仍以 env 为准） */
const APP_TEST_HOST_HINTS: Record<string, string> = {
  "super-mario": "http://super-mario.stable.dasouche.net",
  "crazyracing-kartrider": "https://crazyracing-kartrider.stable.dasouche.net",
  matador: "http://matador.dasouche.net",
};

export function defaultAppRegistryPath() {
  return path.join(process.cwd(), "config/dfc-app-registry.json");
}

export function loadDfcAppRegistryFile(
  filePath = defaultAppRegistryPath(),
): DfcAppRegistryFile {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as DfcAppRegistryFile;
  return raw;
}

export function resolveAppBaseUrlFromEnv(baseUrlEnvKey: string): string | undefined {
  const value = process.env[baseUrlEnvKey]?.trim();
  return value ? value.replace(/\/$/, "") : undefined;
}

export function resolveAppDefaultDomain(appCode: string, baseUrlEnvKey: string) {
  const fromEnv = resolveAppBaseUrlFromEnv(baseUrlEnvKey);
  if (fromEnv) {
    return fromEnv;
  }
  return APP_TEST_HOST_HINTS[appCode] ?? inferDefaultBaseUrlForApp(appCode);
}

export type DfcAppRegistryOption = {
  appCode: string;
  repo: string;
  database: string;
  baseUrlEnvKey: string;
  defaultDomain: string;
  envConfigured: boolean;
};

export function inferBaseUrlEnvKeyForAppCode(
  appCode: string,
  registry = loadDfcAppRegistryFile(),
): string {
  const fromRegistry = registry.apps[appCode]?.baseUrlEnvKey;
  if (fromRegistry) {
    return fromRegistry;
  }
  const normalized = appCode.trim().replace(/-/g, "_").toUpperCase();
  return `DFC_API_${normalized}_BASE_URL`;
}

export function resolveBaseUrlEnvKeyForApp(
  appCode: string,
  registry = loadDfcAppRegistryFile(),
): string {
  return (
    registry.apps[appCode]?.baseUrlEnvKey ??
    inferBaseUrlEnvKeyForAppCode(appCode, registry)
  );
}

function buildAppRegistryOption(
  appCode: string,
  registry = loadDfcAppRegistryFile(),
): DfcAppRegistryOption {
  const meta = registry.apps[appCode];
  const baseUrlEnvKey = resolveBaseUrlEnvKeyForApp(appCode, registry);
  return {
    appCode,
    repo: meta?.repo ?? appCode,
    database: meta?.database ?? "*",
    baseUrlEnvKey,
    defaultDomain: resolveAppDefaultDomain(appCode, baseUrlEnvKey),
    envConfigured: Boolean(resolveAppBaseUrlFromEnv(baseUrlEnvKey)),
  };
}

export function listDfcAppRegistryOptions(
  registry = loadDfcAppRegistryFile(),
): DfcAppRegistryOption[] {
  return Object.keys(registry.apps)
    .map((appCode) => buildAppRegistryOption(appCode, registry))
    .sort((a, b) => a.appCode.localeCompare(b.appCode, "zh-CN"));
}

/** registry + 目录/MySQL 中出现的其它 appCode（自动推断 env key） */
export function listDfcAppServiceOptions(
  extraAppCodes: string[] = [],
  registry = loadDfcAppRegistryFile(),
): DfcAppRegistryOption[] {
  const codes = new Set<string>([
    ...Object.keys(registry.apps),
    ...extraAppCodes.map((code) => code.trim()).filter(Boolean),
  ]);
  return [...codes]
    .map((appCode) => buildAppRegistryOption(appCode, registry))
    .sort((a, b) => a.appCode.localeCompare(b.appCode, "zh-CN"));
}

export function findDfcAppRegistryOption(
  appCode: string,
  registry = loadDfcAppRegistryFile(),
): DfcAppRegistryOption | undefined {
  const trimmed = appCode.trim();
  if (!trimmed) {
    return undefined;
  }
  return buildAppRegistryOption(trimmed, registry);
}

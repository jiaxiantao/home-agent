import { randomUUID } from "node:crypto";

import {
  agentToolCatalog,
  builtinAgentToolNames,
  CORE_AGENT_TOOLS,
} from "@/lib/agent/tool-catalog";
import {
  deleteMysqlManagedTool,
  ensureAgentToolsTableAndSeed,
  listMysqlManagedTools,
  upsertMysqlManagedTool,
} from "@/lib/agent/managed-tools-mysql";
import { isAppMysqlConfigured } from "@/lib/app-mysql/client";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";

export type ManagedToolKind = "builtin" | "http";

export type ManagedHttpConfig = {
  method: "GET" | "POST";
  url: string;
  queryTemplate?: Record<string, unknown>;
  bodyTemplate?: Record<string, unknown>;
  headers?: Record<string, unknown>;
};

export type ManagedAgentTool = {
  id: string;
  name: string;
  label: string;
  description: string;
  args: Record<string, string>;
  enabled: boolean;
  kind: ManagedToolKind;
  http?: ManagedHttpConfig;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

export type AgentToolCatalogEntry = {
  name: string;
  label: string;
  description: string;
  args: Record<string, string>;
};

const REDIS_KEY = `${PRODUCT_SLUG}:agent-tools`;
const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_CUSTOM = 80;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]{1,47}$/;

const globalStore = globalThis as typeof globalThis & {
  __dfcAgentManagedTools?: ManagedAgentTool[];
};

if (!globalStore.__dfcAgentManagedTools) {
  globalStore.__dfcAgentManagedTools = [];
}

function nowIso() {
  return new Date().toISOString();
}

function builtinSnapshot(): ManagedAgentTool[] {
  return agentToolCatalog.map((item) => ({
    id: item.name,
    name: item.name,
    label: item.label,
    description: item.description,
    args: { ...item.args },
    enabled: true,
    kind: "builtin",
    builtin: true,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    createdBy: "system",
  }));
}

function sortManagedTools(items: ManagedAgentTool[]) {
  return [...items].sort((a, b) => {
    if (a.builtin !== b.builtin) {
      return a.builtin ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function enforceCoreToolRules(items: ManagedAgentTool[]) {
  return items.map((item) =>
    CORE_AGENT_TOOLS.has(item.name) ? { ...item, enabled: true } : item,
  );
}

async function readStored(): Promise<ManagedAgentTool[]> {
  if (isAppMysqlConfigured()) {
    await ensureAgentToolsTableAndSeed();
    return listMysqlManagedTools();
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      const raw = await client.get(REDIS_KEY);
      if (raw) {
        return JSON.parse(raw) as ManagedAgentTool[];
      }
    }
  }

  return [...(globalStore.__dfcAgentManagedTools ?? [])];
}

async function writeStored(entries: ManagedAgentTool[]) {
  const trimmed = entries.slice(0, MAX_CUSTOM + agentToolCatalog.length);

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      await client.set(REDIS_KEY, JSON.stringify(trimmed), { PX: TTL_MS });
    }
  }

  globalStore.__dfcAgentManagedTools = trimmed;
  return trimmed;
}

function mergeTools(stored: ManagedAgentTool[]): ManagedAgentTool[] {
  const byName = new Map(stored.map((item) => [item.name, item]));
  const builtins = builtinSnapshot().map((item) => {
    const overlay = byName.get(item.name);
    if (!overlay) {
      return item;
    }
    return {
      ...item,
      id: item.name,
      label: overlay.label.trim() || item.label,
      description: overlay.description.trim() || item.description,
      args:
        overlay.args && Object.keys(overlay.args).length > 0
          ? overlay.args
          : item.args,
      enabled: CORE_AGENT_TOOLS.has(item.name) ? true : overlay.enabled,
      updatedAt: overlay.updatedAt || item.updatedAt,
      createdBy: overlay.createdBy ?? item.createdBy,
    };
  });

  const customs = stored.filter(
    (item) => !item.builtin && !builtinAgentToolNames.has(item.name),
  );

  return [...builtins, ...customs].sort((a, b) => {
    if (a.builtin !== b.builtin) {
      return a.builtin ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function listManagedTools() {
  if (isAppMysqlConfigured()) {
    await ensureAgentToolsTableAndSeed();
    return sortManagedTools(enforceCoreToolRules(await listMysqlManagedTools()));
  }
  return mergeTools(await readStored());
}

export async function listManagedToolsPage(options?: {
  page?: number;
  pageSize?: number;
  q?: string;
  kind?: "all" | "builtin" | "http" | "disabled";
}) {
  const all = await listManagedTools();
  const query = options?.q?.trim().toLowerCase() ?? "";
  const kind = options?.kind ?? "all";
  const filtered = all.filter((item) => {
    if (kind === "builtin" && !item.builtin) {
      return false;
    }
    if (kind === "http" && item.kind !== "http") {
      return false;
    }
    if (kind === "disabled" && item.enabled) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [item.name, item.label, item.description].some((value) =>
      value.toLowerCase().includes(query),
    );
  });

  const pageSize = Math.min(Math.max(options?.pageSize ?? 20, 1), 100);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(options?.page ?? 1, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

export async function getManagedToolByName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  return (
    (await listManagedTools()).find((item) => item.name === trimmed) ?? null
  );
}

export async function getActiveAgentToolCatalog(): Promise<AgentToolCatalogEntry[]> {
  const tools = await listManagedTools();
  return tools
    .filter((item) => item.enabled)
    .map((item) => ({
      name: item.name,
      label: item.label,
      description: item.description,
      args: item.args,
    }));
}

function assertToolName(name: string) {
  if (!TOOL_NAME_RE.test(name)) {
    throw new Error("工具名需为小写字母开头的 snake_case，最长 48 字符");
  }
  if (builtinAgentToolNames.has(name)) {
    throw new Error(`工具名 ${name} 与内置工具冲突`);
  }
}

function normalizeArgs(args?: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    const name = key.trim();
    if (!name) {
      continue;
    }
    next[name] = String(value ?? "").trim() || "string?";
  }
  return next;
}

function normalizeHttp(http?: ManagedHttpConfig | null) {
  if (!http?.url?.trim()) {
    throw new Error("自定义工具需要 HTTP URL");
  }
  const method = http.method === "POST" ? "POST" : "GET";
  return {
    method,
    url: http.url.trim(),
    queryTemplate: http.queryTemplate,
    bodyTemplate: http.bodyTemplate,
    headers: http.headers,
  } satisfies ManagedHttpConfig;
}

export async function createManagedHttpTool(input: {
  name: string;
  label: string;
  description: string;
  args?: Record<string, string>;
  http: ManagedHttpConfig;
  enabled?: boolean;
  createdBy: string;
}) {
  const name = input.name.trim();
  const label = input.label.trim().slice(0, 80);
  const description = input.description.trim().slice(0, 1000);
  assertToolName(name);
  if (!label || !description) {
    throw new Error("工具名称与说明不能为空");
  }

  const existing = await listManagedTools();
  if (existing.some((item) => item.name === name)) {
    throw new Error(`工具名 ${name} 已存在`);
  }

  const customCount = existing.filter((item) => !item.builtin).length;
  if (customCount >= MAX_CUSTOM) {
    throw new Error(`自定义工具最多 ${MAX_CUSTOM} 个`);
  }

  const tool: ManagedAgentTool = {
    id: randomUUID().replace(/-/g, "").slice(0, 16),
    name,
    label,
    description,
    args: normalizeArgs(input.args),
    enabled: input.enabled !== false,
    kind: "http",
    http: normalizeHttp(input.http),
    builtin: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: input.createdBy,
  };

  if (isAppMysqlConfigured()) {
    await upsertMysqlManagedTool(tool);
    return tool;
  }

  const stored = await readStored();
  await writeStored([...stored.filter((item) => item.name !== name), tool]);
  return tool;
}

export async function updateManagedTool(
  id: string,
  input: {
    label?: string;
    description?: string;
    args?: Record<string, string>;
    enabled?: boolean;
    http?: ManagedHttpConfig | null;
  },
) {
  const current = (await listManagedTools()).find((item) => item.id === id);
  if (!current) {
    return null;
  }

  const label = (input.label ?? current.label).trim().slice(0, 80);
  const description = (input.description ?? current.description)
    .trim()
    .slice(0, 1000);
  if (!label || !description) {
    throw new Error("工具名称与说明不能为空");
  }

  let enabled = input.enabled ?? current.enabled;
  if (CORE_AGENT_TOOLS.has(current.name)) {
    enabled = true;
  }

  const next: ManagedAgentTool = {
    ...current,
    label,
    description,
    args: input.args ? normalizeArgs(input.args) : current.args,
    enabled,
    http:
      current.kind === "http"
        ? normalizeHttp(input.http ?? current.http)
        : undefined,
    updatedAt: nowIso(),
  };

  if (isAppMysqlConfigured()) {
    await upsertMysqlManagedTool(next);
    return next;
  }

  const stored = await readStored();
  const without = stored.filter(
    (item) => item.id !== current.id && item.name !== current.name,
  );
  await writeStored([...without, next]);
  return next;
}

export async function deleteManagedTool(id: string) {
  const current = (await listManagedTools()).find((item) => item.id === id);
  if (!current) {
    return false;
  }
  if (current.builtin) {
    throw new Error("内置工具不可删除，只能停用或修改说明");
  }

  if (isAppMysqlConfigured()) {
    return deleteMysqlManagedTool(id);
  }

  const stored = await readStored();
  await writeStored(stored.filter((item) => item.id !== id && item.name !== current.name));
  return true;
}

export function resetManagedToolsForTest() {
  globalStore.__dfcAgentManagedTools = [];
}

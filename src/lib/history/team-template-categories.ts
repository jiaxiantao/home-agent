import {
  createMysqlTeamTemplateCategory,
  deleteMysqlTeamTemplateCategory,
  listMysqlTeamTemplateCategories,
  seedMysqlTeamTemplateCategories,
  updateMysqlTeamTemplateCategory,
} from "@/lib/history/team-template-categories-mysql";
import { isAppMysqlConfigured } from "@/lib/app-mysql/client";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";

export type TeamTemplateCategory = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  createdAt: string;
  templateCount?: number;
};

const REDIS_KEY = `${PRODUCT_SLUG}:team-template-categories`;
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

const globalStore = globalThis as typeof globalThis & {
  __dfcDataAgentTeamTemplateCategories?: TeamTemplateCategory[];
};

function getMemoryList() {
  if (!globalStore.__dfcDataAgentTeamTemplateCategories) {
    globalStore.__dfcDataAgentTeamTemplateCategories = [
      {
        id: "cat_default",
        name: "自定义",
        description: "用户自定义模板",
        sortOrder: 999,
        createdAt: new Date().toISOString(),
        templateCount: 0,
      },
    ];
  }
  return globalStore.__dfcDataAgentTeamTemplateCategories;
}

async function readCategories(): Promise<TeamTemplateCategory[]> {
  if (isAppMysqlConfigured()) {
    return listMysqlTeamTemplateCategories();
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      const raw = await client.get(REDIS_KEY);
      if (raw) {
        return JSON.parse(raw) as TeamTemplateCategory[];
      }
    }
  }

  return [...getMemoryList()];
}

async function writeCategories(entries: TeamTemplateCategory[]) {
  const sorted = [...entries].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"),
  );

  if (isRedisConfigured()) {
    const client = await getRedisClient();
    if (client) {
      await client.set(REDIS_KEY, JSON.stringify(sorted), { PX: TTL_MS });
    }
  }

  globalStore.__dfcDataAgentTeamTemplateCategories = sorted;
  return sorted;
}

export async function listTeamTemplateCategories() {
  return readCategories();
}

export async function listTeamTemplateCategoryNames() {
  const categories = await readCategories();
  return categories.map((item) => item.name);
}

export async function resolveTeamTemplateCategoryName(name?: string) {
  const trimmed = name?.trim().slice(0, 40) ?? "";
  if (!trimmed) {
    return null;
  }

  const categories = await readCategories();
  const matched = categories.find((item) => item.name === trimmed);
  return matched?.name ?? null;
}

export async function createTeamTemplateCategory(input: {
  name: string;
  description?: string;
  sortOrder?: number;
}) {
  const name = input.name.trim().slice(0, 40);
  if (!name) {
    throw new Error("分类名称不能为空");
  }

  if (isAppMysqlConfigured()) {
    return createMysqlTeamTemplateCategory(input);
  }

  const current = await readCategories();
  if (current.some((item) => item.name === name)) {
    throw new Error("分类名称已存在");
  }

  const entry: TeamTemplateCategory = {
    id: `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: input.description?.trim().slice(0, 200) || null,
    sortOrder: input.sortOrder ?? current.length + 1,
    createdAt: new Date().toISOString(),
    templateCount: 0,
  };

  await writeCategories([...current, entry]);
  return entry;
}

export async function updateTeamTemplateCategory(
  id: string,
  input: {
    name?: string;
    description?: string;
    sortOrder?: number;
  },
) {
  if (isAppMysqlConfigured()) {
    return updateMysqlTeamTemplateCategory(id, input);
  }

  const current = await readCategories();
  const index = current.findIndex((item) => item.id === id);
  if (index < 0) {
    return null;
  }

  const existing = current[index]!;
  const name = (input.name ?? existing.name).trim().slice(0, 40);
  if (!name) {
    throw new Error("分类名称不能为空");
  }
  if (current.some((item) => item.id !== id && item.name === name)) {
    throw new Error("分类名称已存在");
  }

  const updated: TeamTemplateCategory = {
    ...existing,
    name,
    description:
      input.description !== undefined
        ? input.description.trim().slice(0, 200) || null
        : existing.description,
    sortOrder: input.sortOrder ?? existing.sortOrder,
  };

  const next = [...current];
  next[index] = updated;
  await writeCategories(next);
  return updated;
}

export async function deleteTeamTemplateCategory(id: string) {
  if (isAppMysqlConfigured()) {
    return deleteMysqlTeamTemplateCategory(id);
  }

  const current = await readCategories();
  const target = current.find((item) => item.id === id);
  if (!target) {
    return false;
  }

  const templateStore = globalThis as typeof globalThis & {
    __dfcDataAgentTeamTemplates?: Array<{ category?: string }>;
  };
  const templateCount = (templateStore.__dfcDataAgentTeamTemplates ?? []).filter(
    (item) => (item.category ?? "通用") === target.name,
  ).length;

  if (templateCount > 0) {
    throw new Error(`该分类下还有 ${templateCount} 条模板，无法删除`);
  }

  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) {
    return false;
  }

  await writeCategories(next);
  return true;
}

export async function seedTeamTemplateCategories(names: string[]) {
  if (isAppMysqlConfigured()) {
    return seedMysqlTeamTemplateCategories(names);
  }

  const current = await readCategories();
  const existingNames = new Set(current.map((item) => item.name));
  const toAdd = names
    .map((name) => name.trim().slice(0, 40))
    .filter((name) => name && !existingNames.has(name));

  const entries = toAdd.map((name, index) => ({
    id: `cat_seed_${String(current.length + index + 1).padStart(3, "0")}`,
    name,
    description: null,
    sortOrder: current.length + index + 1,
    createdAt: new Date().toISOString(),
    templateCount: 0,
  }));

  if (!entries.length) {
    return 0;
  }

  await writeCategories([...current, ...entries]);
  return entries.length;
}

/** 测试用 */
export function clearTeamTemplateCategoriesForTest() {
  globalStore.__dfcDataAgentTeamTemplateCategories = undefined;
}

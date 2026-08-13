import {
  createMysqlTeamTemplateCategory,
  deleteMysqlTeamTemplateCategory,
  listMysqlTeamTemplateCategories,
  seedMysqlTeamTemplateCategories,
  updateMysqlTeamTemplateCategory,
} from "@/lib/history/team-template-categories-mysql";
import { executeAppMysql, isAppMysqlConfigured } from "@/lib/app-mysql/client";
import {
  isMyFavoritesCategory,
  MY_FAVORITES_CATEGORY,
  MY_FAVORITES_CATEGORY_ID,
} from "@/lib/history/team-template-constants";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";

export type TeamTemplateCategory = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  createdAt: string;
  templateCount?: number;
  protected?: boolean;
};

const REDIS_KEY = `${PRODUCT_SLUG}:team-template-categories`;
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

const globalStore = globalThis as typeof globalThis & {
  __dfcDataAgentTeamTemplateCategories?: TeamTemplateCategory[];
};

function myFavoritesCategoryEntry(): TeamTemplateCategory {
  return {
    id: MY_FAVORITES_CATEGORY_ID,
    name: MY_FAVORITES_CATEGORY,
    description: "个人收藏的问法，不可删除",
    sortOrder: 0,
    createdAt: "1970-01-01T00:00:00.000Z",
    templateCount: 0,
    protected: true,
  };
}

function withProtectedFlags(entries: TeamTemplateCategory[]) {
  return entries.map((item) => ({
    ...item,
    protected: isMyFavoritesCategory(item),
  }));
}

function getMemoryList() {
  if (!globalStore.__dfcDataAgentTeamTemplateCategories) {
    globalStore.__dfcDataAgentTeamTemplateCategories = [
      myFavoritesCategoryEntry(),
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

export async function ensureMyFavoritesCategory() {
  if (isAppMysqlConfigured()) {
    await executeAppMysql(
      `INSERT IGNORE INTO team_template_categories (id, name, description, sort_order)
       VALUES (?, ?, ?, ?)`,
      [
        MY_FAVORITES_CATEGORY_ID,
        MY_FAVORITES_CATEGORY,
        "个人收藏的问法，不可删除",
        0,
      ],
    );
    return;
  }

  const current = await readCategories();
  if (current.some((item) => isMyFavoritesCategory(item))) {
    return;
  }

  await writeCategories([myFavoritesCategoryEntry(), ...current]);
}

export async function listTeamTemplateCategories() {
  await ensureMyFavoritesCategory();
  return withProtectedFlags(await readCategories());
}

export async function listTeamTemplateCategoryNames() {
  const categories = await listTeamTemplateCategories();
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
  if (isMyFavoritesCategory(name)) {
    throw new Error("「我的收藏」为固定分类，无法新建同名分类");
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

function assertCategoryNameChangeAllowed(
  existing: TeamTemplateCategory,
  nextName?: string,
) {
  if (
    isMyFavoritesCategory(existing) &&
    nextName &&
    nextName !== existing.name
  ) {
    throw new Error("「我的收藏」为固定分类，无法改名");
  }
  if (
    nextName &&
    isMyFavoritesCategory(nextName) &&
    existing.id !== MY_FAVORITES_CATEGORY_ID
  ) {
    throw new Error("「我的收藏」为固定分类，无法改成该名称");
  }
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
    const current = await listMysqlTeamTemplateCategories();
    const existing = current.find((item) => item.id === id);
    if (!existing) {
      return null;
    }
    assertCategoryNameChangeAllowed(existing, input.name);
    return updateMysqlTeamTemplateCategory(id, input);
  }

  const current = await readCategories();
  const index = current.findIndex((item) => item.id === id);
  if (index < 0) {
    return null;
  }

  const existing = current[index]!;
  assertCategoryNameChangeAllowed(existing, input.name);
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
  if (isMyFavoritesCategory(id)) {
    throw new Error("「我的收藏」为固定分类，无法删除");
  }

  if (isAppMysqlConfigured()) {
    const current = await listMysqlTeamTemplateCategories();
    const target = current.find((item) => item.id === id);
    if (target && isMyFavoritesCategory(target)) {
      throw new Error("「我的收藏」为固定分类，无法删除");
    }
    return deleteMysqlTeamTemplateCategory(id);
  }

  const current = await readCategories();
  const target = current.find((item) => item.id === id);
  if (!target) {
    return false;
  }
  if (isMyFavoritesCategory(target)) {
    throw new Error("「我的收藏」为固定分类，无法删除");
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
  await ensureMyFavoritesCategory();

  const filteredNames = names.filter((name) => !isMyFavoritesCategory(name));

  if (isAppMysqlConfigured()) {
    return seedMysqlTeamTemplateCategories(filteredNames);
  }

  const current = await readCategories();
  const existingNames = new Set(current.map((item) => item.name));
  const toAdd = filteredNames
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

import { agentQuickPrompts } from "@/lib/agent-quick-prompts";
import {
  createMysqlTeamTemplate,
  deleteMysqlTeamTemplate,
  listMysqlTeamTemplates,
  upsertMysqlTeamTemplate,
} from "@/lib/history/team-templates-mysql";
import { createStableTeamTemplateId, createTeamTemplateId } from "@/lib/history/team-template-id";
import { getTeamTemplateUsageMap } from "@/lib/history/team-template-usage";
import {
  ensureMyFavoritesCategory,
  listTeamTemplateCategories,
  listTeamTemplateCategoryNames,
  resolveTeamTemplateCategoryName,
} from "@/lib/history/team-template-categories";
import {
  isMyFavoritesCategory,
  MY_FAVORITES_CATEGORY,
} from "@/lib/history/team-template-constants";
import {
  buildTeamTemplateCategoryTabs,
  mergeTemplatesForCategoryTabs,
  type TeamTemplateCategoryTab,
} from "@/lib/history/team-template-tabs";
import { isAppMysqlConfigured } from "@/lib/app-mysql/client";
import { getRedisClient, isRedisConfigured } from "@/lib/redis/client";
import { PRODUCT_SLUG } from "@/lib/product";

export type TeamTemplate = {
  id: string;
  label: string;
  prompt: string;
  category?: string;
  createdAt: string;
  createdBy: string;
  builtin?: boolean;
  useCount?: number;
  lastUsedAt?: string | null;
  favorited?: boolean;
};

export type TeamTemplateSort = "popular" | "category";

const MAX_CUSTOM = 80;
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

const REDIS_KEY = `${PRODUCT_SLUG}:team-templates`;

const globalStore = globalThis as typeof globalThis & {
  __dfcDataAgentTeamTemplates?: TeamTemplate[];
};

if (!globalStore.__dfcDataAgentTeamTemplates) {
  globalStore.__dfcDataAgentTeamTemplates = [];
}

function builtinTemplates(): TeamTemplate[] {
  return agentQuickPrompts.map((item) => ({
    id: createStableTeamTemplateId(`builtin:${item.id}`),
    label: item.label,
    prompt: item.prompt,
    category: "内置",
    createdAt: "1970-01-01T00:00:00.000Z",
    createdBy: "system",
    builtin: true,
  }));
}

function sortTemplates(items: TeamTemplate[], sort: TeamTemplateSort) {
  if (sort === "popular") {
    return [...items].sort((a, b) => {
      const countDiff = (b.useCount ?? 0) - (a.useCount ?? 0);
      if (countDiff !== 0) {
        return countDiff;
      }

      const aTime = a.lastUsedAt ?? "";
      const bTime = b.lastUsedAt ?? "";
      if (aTime !== bTime) {
        return bTime.localeCompare(aTime);
      }

      return a.label.localeCompare(b.label, "zh-CN");
    });
  }

  return [...items].sort((a, b) => {
    if (a.builtin !== b.builtin) {
      return a.builtin ? 1 : -1;
    }

    const categoryA = a.category ?? "通用";
    const categoryB = b.category ?? "通用";
    if (categoryA !== categoryB) {
      return categoryA.localeCompare(categoryB, "zh-CN");
    }

    return b.createdAt.localeCompare(a.createdAt);
  });
}

async function enrichWithUsage(items: TeamTemplate[]) {
  const usageMap = await getTeamTemplateUsageMap();
  return items.map((item) => {
    const usage = usageMap.get(item.id);
    return {
      ...item,
      useCount: usage?.useCount ?? 0,
      lastUsedAt: usage?.lastUsedAt ?? null,
    };
  });
}

async function readCustom(): Promise<TeamTemplate[]> {
  if (isAppMysqlConfigured()) {
    return listMysqlTeamTemplates();
  }

  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      const raw = await client.get(REDIS_KEY);
      if (raw) {
        return JSON.parse(raw) as TeamTemplate[];
      }
    }
  }

  return [...(globalStore.__dfcDataAgentTeamTemplates ?? [])];
}

async function writeCustom(entries: TeamTemplate[]) {
  const favorites = entries.filter((item) => isMyFavoritesCategory(item.category));
  const others = entries
    .filter((item) => !isMyFavoritesCategory(item.category))
    .slice(0, MAX_CUSTOM);
  const trimmed = [...favorites, ...others];

  if (isRedisConfigured()) {
    const client = await getRedisClient();

    if (client) {
      await client.set(REDIS_KEY, JSON.stringify(trimmed), { PX: TTL_MS });
      globalStore.__dfcDataAgentTeamTemplates = trimmed;
      return trimmed;
    }
  }

  globalStore.__dfcDataAgentTeamTemplates = trimmed;
  return trimmed;
}

function mergeWithBuiltins(custom: TeamTemplate[]) {
  const customIds = new Set(custom.map((item) => item.id));
  const customPrompts = new Set(
    custom
      .filter((item) => !isMyFavoritesCategory(item.category))
      .map((item) => item.prompt),
  );
  const builtins = builtinTemplates().filter(
    (item) => !customIds.has(item.id) && !customPrompts.has(item.prompt),
  );

  return [...custom, ...builtins];
}

export function visibleTeamTemplatesForViewer(
  items: TeamTemplate[],
  viewerUserId: string,
) {
  return items.filter((item) => {
    if (isMyFavoritesCategory(item.category)) {
      return item.createdBy === viewerUserId;
    }
    return true;
  });
}

export function withFavoriteFlags(items: TeamTemplate[], viewerUserId: string) {
  const favPrompts = new Set(
    items
      .filter(
        (item) =>
          isMyFavoritesCategory(item.category) && item.createdBy === viewerUserId,
      )
      .map((item) => item.prompt),
  );

  return items.map((item) => ({
    ...item,
    favorited: isMyFavoritesCategory(item.category)
      ? item.createdBy === viewerUserId
      : favPrompts.has(item.prompt),
  }));
}

export function filterTeamTemplatesForCategory(
  items: TeamTemplate[],
  category?: string,
) {
  const selected = category?.trim() ?? "";
  if (!selected || selected === "全部") {
    return items.filter((item) => !isMyFavoritesCategory(item.category));
  }
  if (isMyFavoritesCategory(selected)) {
    return items.filter((item) => isMyFavoritesCategory(item.category));
  }
  return items.filter((item) => (item.category ?? "通用") === selected);
}

export function isOwnFavoriteTemplate(item: TeamTemplate, userId: string) {
  return isMyFavoritesCategory(item.category) && item.createdBy === userId;
}

export async function listTeamTemplates(options?: {
  sort?: TeamTemplateSort;
  viewerUserId?: string;
}) {
  const custom = await readCustom();
  const merged = mergeWithBuiltins(custom);
  const enriched = await enrichWithUsage(merged);
  let items = sortTemplates(enriched, options?.sort ?? "category");

  if (options?.viewerUserId) {
    items = withFavoriteFlags(
      visibleTeamTemplatesForViewer(items, options.viewerUserId),
      options.viewerUserId,
    );
  }

  return items;
}

export async function listTeamTemplateCategoryTabs(): Promise<
  TeamTemplateCategoryTab[]
> {
  const [categories, custom] = await Promise.all([
    listTeamTemplateCategories(),
    readCustom(),
  ]);
  const templates = await enrichWithUsage(mergeWithBuiltins(custom));
  const publicTemplates = templates.filter(
    (item) => !isMyFavoritesCategory(item.category),
  );

  return buildTeamTemplateCategoryTabs({
    categories: categories.filter((item) => !isMyFavoritesCategory(item)),
    templates: mergeTemplatesForCategoryTabs(publicTemplates),
  });
}

export async function getTeamTemplateById(id: string) {
  const trimmed = id.trim();
  if (!trimmed) {
    return null;
  }

  const templates = await listTeamTemplates({ sort: "popular" });
  return templates.find((item) => item.id === trimmed) ?? null;
}

export type TeamTemplateListQuery = {
  sort?: TeamTemplateSort;
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  viewerUserId?: string;
};

export type TeamTemplateListResult = {
  items: TeamTemplate[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
};

export async function listTeamTemplatesPage(
  options: TeamTemplateListQuery = {},
): Promise<TeamTemplateListResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 10));
  const sort = options.sort ?? "popular";

  const all = await listTeamTemplates({
    sort,
    viewerUserId: options.viewerUserId,
  });
  const categories = await listTeamTemplateCategoryNames();

  const keyword = options.q?.trim().toLowerCase() ?? "";
  const category = options.category?.trim() ?? "";

  let filtered = filterTeamTemplatesForCategory(all, category);
  if (keyword) {
    filtered = filtered.filter((item) => {
      const itemCategory = item.category ?? "通用";
      return (
        item.label.toLowerCase().includes(keyword) ||
        item.prompt.toLowerCase().includes(keyword) ||
        itemCategory.toLowerCase().includes(keyword)
      );
    });
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page, pageSize, categories };
}

export async function createTeamTemplate(input: {
  label: string;
  prompt: string;
  createdBy: string;
  category?: string;
}) {
  const label = input.label.trim().slice(0, 40);
  const prompt = input.prompt.trim().slice(0, 2000);

  if (!label || !prompt) {
    throw new Error("label 与 prompt 不能为空");
  }

  if (isMyFavoritesCategory(input.category)) {
    throw new Error("请使用收藏操作将问法加入「我的收藏」");
  }

  const categoryName =
    (await resolveTeamTemplateCategoryName(input.category)) ?? "自定义";

  if (isAppMysqlConfigured()) {
    return createMysqlTeamTemplate({ ...input, category: categoryName });
  }

  const current = await readCustom();
  const duplicate = current.find(
    (item) =>
      item.prompt === prompt && !isMyFavoritesCategory(item.category),
  );

  if (duplicate) {
    return duplicate;
  }

  const entry: TeamTemplate = {
    id: createTeamTemplateId(),
    label,
    prompt,
    category: categoryName,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };

  await writeCustom([entry, ...current]);
  return entry;
}

export async function updateTeamTemplate(
  id: string,
  input: {
    label?: string;
    prompt?: string;
    category?: string;
  },
) {
  if (isMyFavoritesCategory(input.category)) {
    throw new Error("请使用收藏操作将问法加入「我的收藏」");
  }

  const resolvedCategory = input.category
    ? await resolveTeamTemplateCategoryName(input.category)
    : undefined;

  if (isAppMysqlConfigured()) {
    const existingMysql = await getTeamTemplateById(id);
    if (existingMysql && isMyFavoritesCategory(existingMysql.category)) {
      throw new Error("收藏问法请通过取消收藏管理，不能直接编辑");
    }
    return upsertMysqlTeamTemplate(id, {
      label: input.label,
      prompt: input.prompt,
      category: resolvedCategory ?? input.category,
    });
  }

  const current = await readCustom();
  let index = current.findIndex((item) => item.id === id);
  let existing = index >= 0 ? current[index]! : null;

  if (!existing) {
    const builtin = builtinTemplates().find((item) => item.id === id) ?? null;
    if (builtin) {
      existing = builtin;
    }
  }

  if (!existing) {
    return null;
  }

  if (isMyFavoritesCategory(existing.category)) {
    throw new Error("收藏问法请通过取消收藏管理，不能直接编辑");
  }

  const label = input.label?.trim().slice(0, 40) ?? existing.label;
  const prompt = input.prompt?.trim().slice(0, 2000) ?? existing.prompt;
  const category =
    resolvedCategory ||
    existing.category ||
    (await resolveTeamTemplateCategoryName("自定义")) ||
    "自定义";

  if (!label || !prompt) {
    throw new Error("label 与 prompt 不能为空");
  }

  const updated: TeamTemplate = {
    ...existing,
    label,
    prompt,
    category,
    builtin: undefined,
    createdBy: existing.createdBy === "system" ? "override" : existing.createdBy,
  };

  if (index >= 0) {
    const next = [...current];
    next[index] = updated;
    await writeCustom(next);
  } else {
    await writeCustom([updated, ...current]);
  }

  return updated;
}

export { recordTeamTemplateUse } from "@/lib/history/team-template-usage";

export async function toggleTeamTemplateFavorite(
  userId: string,
  sourceId: string,
): Promise<{ favorited: boolean; template?: TeamTemplate }> {
  const trimmedUserId = userId.trim();
  const trimmedSourceId = sourceId.trim();
  if (!trimmedUserId || !trimmedSourceId) {
    throw new Error("缺少收藏参数");
  }

  await ensureMyFavoritesCategory();

  const all = mergeWithBuiltins(await readCustom());
  const source = all.find((item) => item.id === trimmedSourceId);
  if (!source) {
    throw new Error("模板不存在");
  }

  if (isOwnFavoriteTemplate(source, trimmedUserId)) {
    await deleteTeamTemplate(source.id);
    return { favorited: false };
  }

  const favoriteId = createStableTeamTemplateId(
    `fav:${trimmedUserId}:${trimmedSourceId}`,
  );
  const current = await readCustom();
  const existing = current.find(
    (item) =>
      isOwnFavoriteTemplate(item, trimmedUserId) &&
      (item.id === favoriteId || item.prompt === source.prompt),
  );

  if (existing) {
    await deleteTeamTemplate(existing.id);
    return { favorited: false };
  }

  const entry: TeamTemplate = {
    id: favoriteId,
    label: source.label,
    prompt: source.prompt,
    category: MY_FAVORITES_CATEGORY,
    createdAt: new Date().toISOString(),
    createdBy: trimmedUserId,
  };

  if (isAppMysqlConfigured()) {
    const created = await createMysqlTeamTemplate({
      id: favoriteId,
      label: entry.label,
      prompt: entry.prompt,
      createdBy: trimmedUserId,
      category: MY_FAVORITES_CATEGORY,
    });
    return { favorited: true, template: created };
  }

  await writeCustom([entry, ...current]);
  return { favorited: true, template: entry };
}

export async function deleteTeamTemplate(id: string) {
  if (isAppMysqlConfigured()) {
    return deleteMysqlTeamTemplate(id);
  }

  const current = await readCustom();
  const next = current.filter((item) => item.id !== id);

  if (next.length === current.length) {
    return false;
  }

  await writeCustom(next);
  return true;
}

/** 测试用 */
export function clearTeamTemplatesForTest() {
  globalStore.__dfcDataAgentTeamTemplates = [];
}

import type { TeamTemplate } from "@/lib/history/team-templates";
import type { TeamTemplateCategory } from "@/lib/history/team-template-categories";
import { teamTemplateSeed } from "@/lib/history/team-template-catalog";
import { createStableTeamTemplateId } from "@/lib/history/team-template-id";

export type TeamTemplateCategoryTab = {
  category: string;
  prompt: string;
  templateId: string;
  templateLabel: string;
  useCount: number;
};

const PREFERRED_CATEGORY_ORDER = [
  "车源",
  "客户CRM",
  "求购线索",
  "订单成交",
  "运营报表",
];

export function catalogSeedAsTemplates(): TeamTemplate[] {
  return teamTemplateSeed.map((item) => ({
    id: createStableTeamTemplateId(`seed:${item.category}:${item.label}`),
    label: item.label,
    prompt: item.prompt,
    category: item.category,
    createdAt: "1970-01-01T00:00:00.000Z",
    createdBy: "system",
  }));
}

export function mergeTemplatesForCategoryTabs(
  live: TeamTemplate[],
  seed: TeamTemplate[] = catalogSeedAsTemplates(),
): TeamTemplate[] {
  const prompts = new Set(live.map((item) => item.prompt));
  return [...live, ...seed.filter((item) => !prompts.has(item.prompt))];
}

export function pickTopTemplateInCategory(
  templates: TeamTemplate[],
  category: string,
): TeamTemplate | undefined {
  const items = templates.filter(
    (item) => (item.category ?? "通用") === category && item.category !== "内置",
  );
  if (!items.length) {
    return undefined;
  }

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

    return 0;
  })[0];
}

export function compareCategoryTabOrder(
  a: { name: string; sortOrder: number },
  b: { name: string; sortOrder: number },
) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  const ai = PREFERRED_CATEGORY_ORDER.indexOf(a.name);
  const bi = PREFERRED_CATEGORY_ORDER.indexOf(b.name);
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }

  return a.name.localeCompare(b.name, "zh-CN");
}

export function buildTeamTemplateCategoryTabs(input: {
  categories?: Array<Pick<TeamTemplateCategory, "name" | "sortOrder">>;
  templates: TeamTemplate[];
}): TeamTemplateCategoryTab[] {
  const templates = input.templates.filter(
    (item) => item.category && item.category !== "内置",
  );

  const fromCatalog = (input.categories ?? [])
    .filter((item) => item.name !== "内置")
    .map((item) => ({ name: item.name, sortOrder: item.sortOrder }));

  const names = fromCatalog.length
    ? fromCatalog
    : [...new Set(templates.map((item) => item.category!))].map((name) => ({
        name,
        sortOrder: 0,
      }));

  names.sort(compareCategoryTabOrder);

  const tabs: TeamTemplateCategoryTab[] = [];
  for (const category of names) {
    const top = pickTopTemplateInCategory(templates, category.name);
    if (!top?.prompt) {
      continue;
    }
    tabs.push({
      category: category.name,
      prompt: top.prompt,
      templateId: top.id,
      templateLabel: top.label,
      useCount: top.useCount ?? 0,
    });
  }

  return tabs;
}

"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type { TeamTemplateCategoryTab } from "@/lib/history/team-template-tabs";

export function AgentTemplateCategoryTabs({
  selectedCategory,
  onSelect,
  disabled,
}: {
  selectedCategory?: string;
  onSelect: (tab: TeamTemplateCategoryTab, runImmediately?: boolean) => void;
  disabled?: boolean;
}) {
  const [tabs, setTabs] = useState<TeamTemplateCategoryTab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/templates?view=categoryTabs")
      .then(async (response) => {
        if (!response.ok) {
          return { tabs: [] as TeamTemplateCategoryTab[] };
        }
        return (await response.json()) as { tabs?: TeamTemplateCategoryTab[] };
      })
      .then((data) => {
        if (!cancelled) {
          setTabs(data.tabs ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTabs([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !tabs.length) {
    return null;
  }

  return (
    <div
      data-testid="template-category-tabs"
      className="-mx-1 mb-2.5 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
    >
      <div className="flex w-max min-w-full gap-1 px-1" role="tablist" aria-label="模板分类">
        {tabs.map((tab) => {
          const selected = selectedCategory === tab.category;
          return (
            <button
              key={tab.category}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              title={`${tab.templateLabel}\n${tab.prompt}`}
              onClick={() => onSelect(tab)}
              onDoubleClick={() => onSelect(tab, true)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] transition disabled:opacity-40",
                selected
                  ? "bg-brand/15 text-brand-soft"
                  : "text-zinc-500 hover:bg-brand/10 hover:text-brand-soft",
              )}
            >
              {tab.category}
            </button>
          );
        })}
      </div>
    </div>
  );
}

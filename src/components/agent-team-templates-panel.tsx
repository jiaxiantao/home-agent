"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DarkSelect } from "@/components/dark-select";
import { TemplateFavoriteButton } from "@/components/template-favorite-button";

type TeamTemplateItem = {
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

const PAGE_SIZE = 10;

export function AgentTeamTemplatesPanel({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  const [templates, setTemplates] = useState<TeamTemplateItem[]>([]);
  const [categories, setCategories] = useState<string[]>(["全部"]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [favoritingId, setFavoritingId] = useState<string | null>(null);

  const listRef = useRef<HTMLUListElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setTemplates([]);
        setHasMore(true);
      }

      try {
        const params = new URLSearchParams({
          sort: "popular",
          page: String(nextPage),
          pageSize: String(PAGE_SIZE),
        });
        if (query) {
          params.set("q", query);
        }
        if (category !== "全部") {
          params.set("category", category);
        }

        const response = await fetch(`/api/templates?${params.toString()}`);
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          templates?: TeamTemplateItem[];
          total?: number;
          page?: number;
          pageSize?: number;
          categories?: string[];
          canManage?: boolean;
        };

        if (requestId !== requestIdRef.current) {
          return;
        }

        const items = data.templates ?? [];
        const nextTotal = data.total ?? items.length;
        setTotal(nextTotal);
        const rawCategories = data.categories ?? [];
        const favorites = rawCategories.filter((c) => c === "我的收藏");
        const rest = rawCategories
          .filter((c) => c !== "我的收藏")
          .sort((a, b) => a.localeCompare(b, "zh-CN"));
        setCategories(["全部", ...favorites, ...rest]);
        setTemplates((current) => (append ? [...current, ...items] : items));
        setPage(nextPage);
        setHasMore(nextPage * PAGE_SIZE < nextTotal);
      } catch {
        // ignore
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [category, query],
  );

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  function handleListScroll() {
    const list = listRef.current;
    if (!list || loading || loadingMore || !hasMore) {
      return;
    }

    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining < 48) {
      void loadPage(page + 1, true);
    }
  }

  async function handleFavorite(item: TeamTemplateItem) {
    setFavoritingId(item.id);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "favorite", id: item.id }),
      });
      if (!response.ok) {
        return;
      }
      await loadPage(1, false);
    } finally {
      setFavoritingId(null);
    }
  }

  async function handleSelect(item: TeamTemplateItem) {
    void fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "use", id: item.id }),
    });
    onSelect(item.prompt);
    setTemplates((current) =>
      [...current]
        .map((entry) =>
          entry.id === item.id
            ? { ...entry, useCount: (entry.useCount ?? 0) + 1 }
            : entry,
        )
        .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0)),
    );
  }

  return (
    <div className="ui-panel flex max-h-[28rem] flex-col p-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted">团队问法模板</p>
        <span className="font-mono text-[10px] text-muted-foreground">{total} 条</span>
      </div>
      <p className="mt-1 shrink-0 text-[10px] text-muted-foreground">
        按热度排序；星标可收藏到「我的收藏」
      </p>

      <div className="mt-3 shrink-0 space-y-2">
        <input
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="搜索问法…"
          className="w-full rounded-lg border border-border bg-input px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-brand/30"
        />
        <DarkSelect
          value={category}
          options={categories.map((item) => ({ value: item, label: item }))}
          onChange={(next) => {
            setCategory(next);
            setPage(1);
          }}
          buttonClassName="rounded-lg bg-input px-2 py-1.5 text-[11px]"
        />
      </div>

      {loading && !templates.length ? (
        <div className="mt-3 flex items-center justify-center gap-2 py-8 text-[11px] text-muted">
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-brand/30 border-t-brand"
            aria-hidden
          />
          加载中…
        </div>
      ) : templates.length ? (
        <ul
          ref={listRef}
          onScroll={handleListScroll}
          className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5"
        >
          {templates.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border bg-surface p-2"
            >
              <div className="flex items-start gap-1">
                <button
                  type="button"
                  onClick={() => void handleSelect(item)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-foreground">{item.label}</p>
                    <span className="font-mono text-[9px] text-brand-soft/80">
                      {item.useCount ?? 0}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {item.category ?? "通用"}
                    </span>
                    {item.builtin ? (
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        内置
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10px] text-muted">
                    {item.prompt}
                  </p>
                </button>
                <TemplateFavoriteButton
                  favorited={item.favorited}
                  disabled={favoritingId === item.id}
                  onToggle={() => void handleFavorite(item)}
                />
              </div>
            </li>
          ))}
          {loadingMore || loading ? (
            <li className="flex items-center justify-center gap-2 py-3 text-[10px] text-muted">
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border border-brand/30 border-t-brand"
                aria-hidden
              />
              加载中…
            </li>
          ) : null}
          {!loading && !loadingMore && !hasMore && templates.length > 0 ? (
            <li className="py-2 text-center text-[10px] text-muted">
              已加载全部
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-muted-foreground">暂无匹配的团队模板</p>
      )}
    </div>
  );
}

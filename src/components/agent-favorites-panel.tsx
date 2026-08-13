"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FavoriteItem = {
  id: string;
  label: string;
  prompt: string;
  createdAt: string;
};

const PAGE_SIZE = 10;

export function AgentFavoritesPanel({
  currentPrompt,
  onSelect,
}: {
  currentPrompt: string;
  onSelect: (prompt: string) => void;
}) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const listRef = useRef<HTMLUListElement>(null);
  const requestIdRef = useRef(0);

  const loadPage = useCallback(async (nextPage: number, append: boolean) => {
    const requestId = ++requestIdRef.current;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setFavorites([]);
      setHasMore(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      const response = await fetch(`/api/favorites?${params.toString()}`);
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        favorites?: FavoriteItem[];
        total?: number;
      };

      if (requestId !== requestIdRef.current) {
        return;
      }

      const items = data.favorites ?? [];
      const nextTotal = data.total ?? items.length;
      setTotal(nextTotal);
      setFavorites((current) => (append ? [...current, ...items] : items));
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
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage(1, false);
    }, 0);
    return () => window.clearTimeout(timer);
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

  async function handleSave() {
    if (!currentPrompt.trim()) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || currentPrompt.trim().slice(0, 16),
          prompt: currentPrompt.trim(),
        }),
      });

      if (response.ok) {
        setLabel("");
        await loadPage(1, false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-panel flex max-h-[22rem] flex-col p-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-zinc-400">收藏问法</p>
        <span className="font-mono text-[10px] text-zinc-600">{total} 条</span>
      </div>

      <div className="mt-3 flex shrink-0 gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="名称（可选）"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-brand/30"
        />
        <button
          type="button"
          disabled={saving || !currentPrompt.trim()}
          onClick={() => void handleSave()}
          className="shrink-0 rounded-full border border-brand/30 px-2.5 py-1 text-[11px] text-brand-soft transition hover:bg-brand/10 disabled:opacity-40"
        >
          {saving ? "收藏中…" : "收藏当前"}
        </button>
      </div>

      {loading && !favorites.length ? (
        <div className="mt-3 flex items-center justify-center gap-2 py-8 text-[11px] text-slate-500">
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-brand/30 border-t-brand"
            aria-hidden
          />
          加载中…
        </div>
      ) : favorites.length ? (
        <ul
          ref={listRef}
          onScroll={handleListScroll}
          className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5"
        >
          {favorites.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-2"
            >
              <button
                type="button"
                onClick={() => onSelect(item.prompt)}
                className="w-full text-left"
              >
                <p className="text-xs text-slate-200">{item.label}</p>
                <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">
                  {item.prompt}
                </p>
              </button>
            </li>
          ))}
          {loadingMore || loading ? (
            <li className="flex items-center justify-center gap-2 py-3 text-[10px] text-slate-500">
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border border-brand/30 border-t-brand"
                aria-hidden
              />
              加载中…
            </li>
          ) : null}
          {!loading && !loadingMore && !hasMore && favorites.length > 0 ? (
            <li className="py-2 text-center text-[10px] text-slate-700">
              已加载全部
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-slate-600">
          把常用问法收藏后，可一键回填
        </p>
      )}
    </div>
  );
}

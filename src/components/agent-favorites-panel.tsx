"use client";

import { useCallback, useEffect, useState } from "react";

export type FavoriteItem = {
  id: string;
  label: string;
  prompt: string;
  createdAt: string;
};

export function AgentFavoritesPanel({
  currentPrompt,
  onSelect,
}: {
  currentPrompt: string;
  onSelect: (prompt: string) => void;
}) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/favorites");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { favorites?: FavoriteItem[] };
      setFavorites(data.favorites ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

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
        await refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/favorites?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  return (
    <div className="ui-panel p-3">
      <p className="text-[11px] font-medium text-zinc-400">收藏问法</p>

      <div className="mt-3 flex gap-2">
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
          收藏当前
        </button>
      </div>

      {favorites.length ? (
        <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto">
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
              <button
                type="button"
                onClick={() => void handleDelete(item.id)}
                className="mt-1 text-[10px] text-slate-600 transition hover:text-rose-300"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-slate-600">
          把常用问法收藏后，可一键回填
        </p>
      )}
    </div>
  );
}

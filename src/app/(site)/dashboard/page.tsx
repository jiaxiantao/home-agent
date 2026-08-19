"use client";

import { useCallback, useEffect, useState } from "react";

import { A2UISurfaceView } from "@/components/a2ui/surface-view";
import type { DashboardCard } from "@/lib/dashboard/store";

export default function DashboardPage() {
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCards = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { credentials: "include" });
      if (response.ok) {
        const data = (await response.json()) as { cards: DashboardCard[] };
        setCards(data.cards);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const handleUnpin = useCallback(
    async (id: string) => {
      await fetch(`/api/dashboard?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      setCards((prev) => prev.filter((c) => c.id !== id));
    },
    [],
  );

  const handleToggleShare = useCallback(
    async (card: DashboardCard) => {
      await fetch("/api/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: card.id, shared: !card.shared }),
      });
      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, shared: !c.shared } : c)),
      );
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        加载看板…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">数据看板</h1>
        <span className="text-xs text-muted">
          {cards.length} 张卡片
        </span>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-border p-10 text-center text-sm text-muted">
          <p>暂无看板卡片</p>
          <p className="mt-1 text-xs">
            在 Agent 对话中查询数据后，点击「固定到看板」即可添加。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className="rounded-xl border border-border bg-surface p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {card.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted line-clamp-2">
                    {card.question}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void handleToggleShare(card)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-brand/10 hover:text-brand-soft"
                    title={card.shared ? "取消共享" : "共享给团队"}
                  >
                    {card.shared ? "已共享" : "共享"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUnpin(card.id)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-rose-500/10 hover:text-rose-400"
                    title="移除"
                  >
                    移除
                  </button>
                </div>
              </div>

              {card.surface ? (
                <A2UISurfaceView surface={card.surface} variant="result" />
              ) : card.sql ? (
                <pre className="overflow-x-auto rounded-lg border border-border bg-code px-3 py-2 font-mono text-[11px] text-foreground">
                  {card.sql}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

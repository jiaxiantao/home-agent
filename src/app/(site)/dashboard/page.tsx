"use client";

import { useCallback, useEffect, useState } from "react";

import { A2UISurfaceView } from "@/components/a2ui/surface-view";
import { ConsoleShell } from "@/components/console-shell";
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

  const handleUnpin = useCallback(async (id: string) => {
    await fetch(`/api/dashboard?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleToggleShare = useCallback(async (card: DashboardCard) => {
    await fetch("/api/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: card.id, shared: !card.shared }),
    });
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, shared: !c.shared } : c)),
    );
  }, []);

  return (
    <ConsoleShell
      title="数据看板"
      description="将查询结果固定为看板卡片，支持团队共享"
      actions={
        <span className="text-xs text-muted">{cards.length} 张卡片</span>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted">
          加载看板…
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-2xl border border-dashed border-border px-10 py-12">
            <p className="text-sm text-muted">暂无看板卡片</p>
            <p className="mt-2 max-w-xs text-xs leading-5 text-muted/70">
              在数据智能体对话中查询数据后，可将结果固定到看板，方便团队查看。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className="ui-panel space-y-3 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-foreground">
                    {card.title}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted">
                    {card.question}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void handleToggleShare(card)}
                    className="ui-btn-ghost px-1.5 py-0.5 text-[10px]"
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
                <div className="overflow-hidden rounded-lg border border-border bg-code">
                  <div className="border-b border-border px-3 py-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      sql
                    </span>
                  </div>
                  <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-5 text-foreground">
                    {card.sql}
                  </pre>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </ConsoleShell>
  );
}

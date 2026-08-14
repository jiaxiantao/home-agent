"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { ThreadListItem } from "@/lib/agent/thread-types";

const HISTORY_LIMIT = 20;

async function fetchRecentThreads(): Promise<ThreadListItem[] | null> {
  try {
    const response = await fetch(
      `/api/agent-threads?page=1&pageSize=${HISTORY_LIMIT}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { items?: ThreadListItem[] };
    return (data.items ?? []).slice(0, HISTORY_LIMIT);
  } catch {
    return null;
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString("zh-CN");
}

export function AgentHistoryPanel({
  refreshToken,
  currentThreadId,
}: {
  refreshToken?: number;
  currentThreadId?: string;
}) {
  const [items, setItems] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const threads = await fetchRecentThreads();
      setItems(threads ?? []);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, refreshToken]);

  return (
    <div className="ui-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">
          最近对话
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            · 最近 {HISTORY_LIMIT} 条
          </span>
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1.5 text-[10px] text-muted transition hover:text-foreground disabled:opacity-60"
        >
          {loading ? (
            <>
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border border-brand/30 border-t-brand"
                aria-hidden
              />
              刷新中
            </>
          ) : (
            "刷新"
          )}
        </button>
      </div>

      {loading && !initialized ? (
        <div className="mt-3 flex items-center justify-center gap-2 py-6 text-[11px] text-muted">
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-brand/30 border-t-brand"
            aria-hidden
          />
          加载中…
        </div>
      ) : items.length ? (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {items.map((item) => {
            const active = item.threadId === currentThreadId;
            return (
              <li
                key={item.threadId}
                className={`rounded-lg border p-2.5 ${
                  active
                    ? "border-brand/30 bg-brand/[0.06]"
                    : "border-border bg-surface"
                }`}
              >
                <Link
                  href={`/agents?threadId=${encodeURIComponent(item.threadId)}`}
                  className="block w-full text-left"
                >
                  <p className="line-clamp-2 text-xs text-foreground">
                    {item.title || "未命名对话"}
                  </p>
                  {item.preview ? (
                    <p className="mt-1 line-clamp-1 text-[10px] text-muted">
                      {item.preview}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-muted">
                    {formatTime(item.updatedAt)} · {item.messageCount} 条消息
                    {active ? " · 当前" : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-muted">暂无历史对话</p>
      )}
    </div>
  );
}

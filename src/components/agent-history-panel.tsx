"use client";

import { useCallback, useEffect, useState } from "react";

import {
  listQueryHistory,
  removeQueryHistory,
  type QueryHistoryEntry,
} from "@/lib/history/query-history";

type HistorySource = "server" | "local";

const HISTORY_LIMIT = 20;

async function fetchServerHistory(): Promise<QueryHistoryEntry[] | null> {
  try {
    const response = await fetch(`/api/history?limit=${HISTORY_LIMIT}`);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      entries?: Array<{
        id: string;
        threadId: string;
        question: string;
        answer?: string;
        sql?: string;
        rowCount?: number;
        createdAt: string;
        status: QueryHistoryEntry["status"];
      }>;
    };

    return (data.entries ?? []).slice(0, HISTORY_LIMIT).map((entry) => ({
      id: entry.id,
      threadId: entry.threadId,
      question: entry.question,
      answer: entry.answer,
      sql: entry.sql,
      rowCount: entry.rowCount,
      createdAt: entry.createdAt,
      status: entry.status,
    }));
  } catch {
    return null;
  }
}

export function AgentHistoryPanel({
  onSelect,
  refreshToken,
}: {
  onSelect: (entry: QueryHistoryEntry) => void;
  refreshToken?: number;
}) {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>([]);
  const [source, setSource] = useState<HistorySource>("local");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const serverEntries = await fetchServerHistory();

      if (serverEntries) {
        setEntries(serverEntries);
        setSource("server");
        return;
      }

      setEntries(listQueryHistory().slice(0, HISTORY_LIMIT));
      setSource("local");
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

  async function handleDelete(id: string) {
    if (source === "server") {
      await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } else {
      removeQueryHistory(id);
    }

    await refresh();
  }

  return (
    <div className="ui-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-400">
          最近查询
          <span className="ml-1 text-[10px] font-normal text-slate-600">
            · {source === "server" ? "服务端" : "本地"} · 最近 {HISTORY_LIMIT} 条
          </span>
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 transition hover:text-slate-300 disabled:opacity-60"
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
        <div className="mt-3 flex items-center justify-center gap-2 py-6 text-[11px] text-slate-500">
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-brand/30 border-t-brand"
            aria-hidden
          />
          加载中…
        </div>
      ) : entries.length ? (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5"
            >
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className="w-full text-left"
              >
                <p className="line-clamp-2 text-xs text-slate-200">
                  {entry.question}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {new Date(entry.createdAt).toLocaleString()} · {entry.status}
                  {entry.rowCount != null ? ` · ${entry.rowCount} 行` : ""}
                </p>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(entry.id)}
                className="mt-1 text-[10px] text-slate-600 transition hover:text-rose-300"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-zinc-500">暂无查询历史</p>
      )}
    </div>
  );
}

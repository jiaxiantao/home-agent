"use client";

import { useCallback, useEffect, useState } from "react";

import {
  listQueryHistory,
  removeQueryHistory,
  type QueryHistoryEntry,
} from "@/lib/history/query-history";

type HistorySource = "server" | "local";

async function fetchServerHistory(): Promise<QueryHistoryEntry[] | null> {
  try {
    const response = await fetch("/api/history?limit=50");

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

    return (data.entries ?? []).map((entry) => ({
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

  const refresh = useCallback(async () => {
    const serverEntries = await fetchServerHistory();

    if (serverEntries && serverEntries.length >= 0) {
      setEntries(serverEntries);
      setSource("server");
      return;
    }

    setEntries(listQueryHistory());
    setSource("local");
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

  if (!entries.length) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-[11px] text-zinc-500">
        暂无查询历史（服务端 + 本地缓存，最多 100 条）
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-400">
          最近查询
          <span className="ml-1 text-[10px] font-normal text-slate-600">
            · {source === "server" ? "服务端" : "本地"}
          </span>
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[10px] text-slate-500 transition hover:text-slate-300"
        >
          刷新
        </button>
      </div>
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
              <p className="line-clamp-2 text-xs text-slate-200">{entry.question}</p>
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
    </div>
  );
}

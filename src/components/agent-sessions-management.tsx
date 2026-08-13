"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DarkSelect } from "@/components/dark-select";
import type { ThreadListItem } from "@/lib/agent/thread-types";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConfirmDeleteDialog({
  open,
  label,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  label: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-white">删除会话？</h2>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          确认删除「{label}」？删除后无法继续该对话。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30"
          >
            {loading ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentSessionsManagement() {
  const [items, setItems] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ThreadListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (query.trim()) {
        params.set("q", query.trim());
      }

      const response = await fetch(`/api/agent-threads?${params.toString()}`);
      if (!response.ok) {
        setItems([]);
        setTotal(0);
        return;
      }

      const data = (await response.json()) as {
        items?: ThreadListItem[];
        total?: number;
        page?: number;
      };
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      if (data.page && data.page !== page) {
        setPage(data.page);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/agent-threads?id=${encodeURIComponent(deleteTarget.threadId)}`,
        { method: "DELETE" },
      );
      if (response.ok) {
        setDeleteTarget(null);
        await refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 shrink-0">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-brand-soft"
        >
          <span aria-hidden>←</span>
          返回数据智能体
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-white">历史会话</h1>
        <p className="mt-1 text-sm text-slate-500">
          数据智能体中的对话会写入 MySQL（未配置时回退 Redis/内存）。点「继续对话」可接着追问。
        </p>
      </div>

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex min-w-[280px] flex-1 items-stretch overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-brand/30">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="按标题或对话内容搜索"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-200 outline-none"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setQuery(searchInput);
                setPage(1);
              }
            }}
          />
          <button
            type="button"
            aria-label="搜索"
            onClick={() => {
              setQuery(searchInput);
              setPage(1);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 border-l border-white/10 px-4 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            搜索
          </button>
        </div>

        <Link
          href="/agents?new=1"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover"
        >
          新对话
        </Link>

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
        >
          刷新
        </button>
      </div>

      <div className="ui-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {loading ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">加载中…</p>
          ) : items.length ? (
            <ul className="divide-y divide-white/[0.06]">
              {items.map((item) => (
                <li
                  key={item.threadId}
                  className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 transition hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {item.preview || "暂无预览"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                      <span>{item.messageCount} 条消息</span>
                      <span>更新 {formatDateTime(item.updatedAt)}</span>
                      <span>开始 {formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <Link
                      href={`/agents?threadId=${encodeURIComponent(item.threadId)}`}
                      className="rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white transition hover:bg-white/15"
                    >
                      继续对话
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="text-slate-500 transition hover:text-rose-300"
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              暂无历史会话，去数据智能体聊一轮后会自动出现。
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>
          第 {rangeStart}-{rangeEnd} 条，共 {total} 条
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>每页</span>
            <DarkSelect
              value={String(pageSize)}
              options={PAGE_SIZE_OPTIONS.map((size) => ({
                value: String(size),
                label: `${size} 条`,
              }))}
              onChange={(next) => {
                setPageSize(Number(next) as (typeof PAGE_SIZE_OPTIONS)[number]);
                setPage(1);
              }}
              className="w-28"
              buttonClassName="rounded-lg px-3 py-2 text-sm"
              align="right"
              placement="top"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white disabled:opacity-40"
            >
              上一页
            </button>
            <span className="min-w-12 text-center text-xs text-slate-400">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        label={deleteTarget?.title ?? ""}
        loading={deleting}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

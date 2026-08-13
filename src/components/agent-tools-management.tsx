"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ManagedToolItem = {
  id: string;
  name: string;
  label: string;
  description: string;
  args: Record<string, string>;
  enabled: boolean;
  kind: "builtin" | "http";
  http?: {
    method: "GET" | "POST";
    url: string;
    queryTemplate?: Record<string, unknown>;
    bodyTemplate?: Record<string, unknown>;
  };
  builtin: boolean;
  updatedAt: string;
};

type Draft = {
  name: string;
  label: string;
  description: string;
  argsText: string;
  enabled: boolean;
  method: "GET" | "POST";
  url: string;
  queryText: string;
  bodyText: string;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const CORE_TOOLS = new Set(["propose_sql", "execute_sql"]);

const emptyDraft = (): Draft => ({
  name: "",
  label: "",
  description: "",
  argsText: "{\n  \n}",
  enabled: true,
  method: "GET",
  url: "",
  queryText: "",
  bodyText: "",
});

function prettyJson(value: unknown) {
  if (!value || (typeof value === "object" && Object.keys(value).length === 0)) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(text: string, label: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} 需为 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

function parseArgs(text: string) {
  const parsed = parseJsonObject(text, "参数说明");
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)]),
  );
}

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

function ToolFormModal({
  open,
  title,
  draft,
  saving,
  creating,
  error,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: Draft;
  saving: boolean;
  creating: boolean;
  error: string | null;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-form-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="tool-form-title" className="text-base font-medium text-white">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {creating
              ? "新增只读 HTTP 工具。Agent 会按名称/说明决定何时调用；测试环境仅允许 *.dasouche.net。"
              : "可修改展示名、说明、参数提示与启停。内置工具不能改 name。"}
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          {creating ? (
            <label className="block">
              <span className="mb-1.5 block text-xs text-slate-400">工具名（snake_case）</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  onChange({ ...draft, name: event.target.value })
                }
                placeholder="例如：query_car_by_plate"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-slate-200 outline-none focus:border-brand/30"
              />
            </label>
          ) : (
            <p className="text-xs text-slate-500">
              工具名 <code className="text-slate-300">{draft.name}</code>
            </p>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">展示名称</span>
            <input
              value={draft.label}
              onChange={(event) =>
                onChange({ ...draft, label: event.target.value })
              }
              placeholder="例如：按车牌查车辆"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none focus:border-brand/30"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">说明（给 Agent 看）</span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                onChange({ ...draft, description: event.target.value })
              }
              rows={3}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-slate-200 outline-none focus:border-brand/30"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">
              参数提示 JSON（如 {"{ \"plate\": \"string\" }"}）
            </span>
            <textarea
              value={draft.argsText}
              onChange={(event) =>
                onChange({ ...draft, argsText: event.target.value })
              }
              rows={4}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-5 text-slate-200 outline-none focus:border-brand/30"
            />
          </label>

          {creating || draft.url || draft.method === "POST" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                <label className="block">
                  <span className="mb-1.5 block text-xs text-slate-400">方法</span>
                  <select
                    value={draft.method}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        method: event.target.value === "POST" ? "POST" : "GET",
                      })
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none focus:border-brand/30"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-slate-400">
                    URL（可用 {"{{arg}}"}）
                  </span>
                  <input
                    value={draft.url}
                    onChange={(event) =>
                      onChange({ ...draft, url: event.target.value })
                    }
                    placeholder="https://crazyracing-kartrider.stable.dasouche.net/..."
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-brand/30"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs text-slate-400">Query 模板 JSON</span>
                <textarea
                  value={draft.queryText}
                  onChange={(event) =>
                    onChange({ ...draft, queryText: event.target.value })
                  }
                  rows={3}
                  placeholder='{"keywords":"{{plate}}"}'
                  className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-5 text-slate-200 outline-none focus:border-brand/30"
                />
              </label>
              {draft.method === "POST" ? (
                <label className="block">
                  <span className="mb-1.5 block text-xs text-slate-400">Body 模板 JSON</span>
                  <textarea
                    value={draft.bodyText}
                    onChange={(event) =>
                      onChange({ ...draft, bodyText: event.target.value })
                    }
                    rows={4}
                    placeholder='{"keywords":"{{plate}}","objCode":"car"}'
                    className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-5 text-slate-200 outline-none focus:border-brand/30"
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {!CORE_TOOLS.has(draft.name) ? (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  onChange({ ...draft, enabled: event.target.checked })
                }
              />
              启用（Agent 可调用）
            </label>
          ) : (
            <p className="text-xs text-slate-500">核心工具必须保持启用。</p>
          )}

          {error ? <p className="text-xs text-amber-400">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={
              saving ||
              !draft.label.trim() ||
              !draft.description.trim() ||
              (creating && (!draft.name.trim() || !draft.url.trim()))
            }
            onClick={onSave}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100 disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentToolsManagement() {
  const [tools, setTools] = useState<ManagedToolItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        kind,
      });
      if (query.trim()) {
        params.set("q", query.trim());
      }
      const response = await fetch(`/api/agent-tools?${params.toString()}`);
      if (!response.ok) {
        setError("加载工具列表失败");
        return;
      }
      const data = (await response.json()) as {
        tools?: ManagedToolItem[];
        total?: number;
        canManage?: boolean;
        page?: number;
      };
      setTools(data.tools ?? []);
      setTotal(data.total ?? 0);
      setCanManage(Boolean(data.canManage));
      if (data.page && data.page !== page) {
        setPage(data.page);
      }
    } finally {
      setLoading(false);
    }
  }, [kind, page, pageSize, query]);

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

  function openCreateModal() {
    setCreating(true);
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(item: ManagedToolItem) {
    setCreating(false);
    setEditingId(item.id);
    setDraft({
      name: item.name,
      label: item.label,
      description: item.description,
      argsText: prettyJson(item.args) || "{\n  \n}",
      enabled: item.enabled,
      method: item.http?.method ?? "GET",
      url: item.http?.url ?? "",
      queryText: prettyJson(item.http?.queryTemplate),
      bodyText: prettyJson(item.http?.bodyTemplate),
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }
    setModalOpen(false);
    setEditingId(null);
    setCreating(false);
    setDraft(emptyDraft());
    setFormError(null);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const args = parseArgs(draft.argsText);
      const queryTemplate = draft.queryText.trim()
        ? parseJsonObject(draft.queryText, "Query 模板")
        : undefined;
      const bodyTemplate = draft.bodyText.trim()
        ? parseJsonObject(draft.bodyText, "Body 模板")
        : undefined;

      const response = await fetch("/api/agent-tools", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          creating
            ? {
                name: draft.name.trim(),
                label: draft.label.trim(),
                description: draft.description.trim(),
                args,
                enabled: draft.enabled,
                http: {
                  method: draft.method,
                  url: draft.url.trim(),
                  queryTemplate,
                  bodyTemplate,
                },
              }
            : {
                id: editingId,
                label: draft.label.trim(),
                description: draft.description.trim(),
                args,
                enabled: draft.enabled,
                http:
                  draft.url.trim() || queryTemplate || bodyTemplate
                    ? {
                        method: draft.method,
                        url: draft.url.trim(),
                        queryTemplate,
                        bodyTemplate,
                      }
                    : undefined,
              },
        ),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFormError(payload.error ?? "保存失败");
        return;
      }
      closeModal();
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(item: ManagedToolItem) {
    if (!canManage || CORE_TOOLS.has(item.name)) {
      return;
    }
    await fetch("/api/agent-tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, enabled: !item.enabled }),
    });
    await refresh();
  }

  async function handleDelete(item: ManagedToolItem) {
    if (!canManage || item.builtin) {
      return;
    }
    if (!window.confirm(`确认删除自定义工具「${item.label}」？`)) {
      return;
    }
    await fetch(`/api/agent-tools?id=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 shrink-0">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-brand-soft"
        >
          <span aria-hidden>←</span>
          返回问数助手
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-white">工具管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          查看 Agent 可调用的全部工具；可修改说明与启停，也可新增只读 HTTP 工具。
        </p>
      </div>

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex min-w-[280px] flex-1 items-stretch overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-brand/30">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="按名称、工具名或说明搜索"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-200 outline-none"
          />
        </div>

        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(1);
          }}
          className="w-36 shrink-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-200 outline-none"
        >
          <option value="all">全部类型</option>
          <option value="builtin">内置</option>
          <option value="http">HTTP 自定义</option>
          <option value="disabled">已停用</option>
        </select>

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
        >
          刷新
        </button>

        {canManage ? (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-slate-100"
          >
            <span aria-hidden>+</span>
            新增工具
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 text-sm text-amber-400">{error}</p>
      ) : null}

      <div className="ui-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {loading ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">加载中…</p>
          ) : tools.length ? (
            <ul className="divide-y divide-white/[0.06]">
              {tools.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 transition hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                        {item.name}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          item.builtin
                            ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
                            : "border-violet-400/20 bg-violet-400/10 text-violet-300"
                        }`}
                      >
                        {item.builtin ? "内置" : "HTTP"}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          item.enabled
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                            : "border-slate-500/30 bg-slate-500/10 text-slate-500"
                        }`}
                      >
                        {item.enabled ? "启用" : "停用"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {item.description}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-slate-600">
                      {Object.keys(item.args).length
                        ? Object.entries(item.args)
                            .map(([key, value]) => `${key}:${value}`)
                            .join(" · ")
                        : "无参数"}
                      {item.http?.url ? ` · ${item.http.method} ${item.http.url}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                    <span className="text-[11px] text-slate-600">
                      更新 {formatDateTime(item.updatedAt)}
                    </span>
                    {canManage ? (
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="text-slate-400 transition hover:text-white"
                        >
                          编辑
                        </button>
                        {!CORE_TOOLS.has(item.name) ? (
                          <button
                            type="button"
                            onClick={() => void toggleEnabled(item)}
                            className="text-slate-400 transition hover:text-white"
                          >
                            {item.enabled ? "停用" : "启用"}
                          </button>
                        ) : null}
                        {!item.builtin ? (
                          <button
                            type="button"
                            onClick={() => void handleDelete(item)}
                            className="text-slate-500 transition hover:text-rose-300"
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              暂无匹配工具
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>
          第 {rangeStart}-{rangeEnd} 条，共 {total} 条
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
              setPage(1);
            }}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-slate-200"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} 条 / 页
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          >
            上一页
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      <ToolFormModal
        open={modalOpen}
        title={creating ? "新增 HTTP 工具" : "编辑工具"}
        draft={draft}
        saving={saving}
        creating={creating}
        error={formError}
        onChange={setDraft}
        onClose={closeModal}
        onSave={() => void handleSave()}
      />
    </div>
  );
}

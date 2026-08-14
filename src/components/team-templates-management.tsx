"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DarkSelect } from "@/components/dark-select";
import { TemplateFavoriteButton } from "@/components/template-favorite-button";
import { MY_FAVORITES_CATEGORY } from "@/lib/history/team-template-constants";

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

type Draft = {
  label: string;
  prompt: string;
  category: string;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const emptyDraft = (): Draft => ({
  label: "",
  prompt: "",
  category: "自定义",
});

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
    second: "2-digit",
  });
}

function templateTypeLabel(item: TeamTemplateItem) {
  if (item.builtin || item.createdBy === "system") {
    return "内置";
  }
  if (item.createdBy === "seed") {
    return "种子";
  }
  return "自定义";
}

function TemplateFormModal({
  open,
  title,
  draft,
  saving,
  categories,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: Draft;
  saving: boolean;
  categories: string[];
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-form-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-elevated shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id="template-form-title" className="text-base font-medium text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted">
            填写模板名称、分类与完整问法，保存后全员可在数据智能体中使用。
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">模板名称</span>
            <input
              value={draft.label}
              onChange={(event) =>
                onChange({ ...draft, label: event.target.value })
              }
              placeholder="例如：本月放款合计"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-brand/30"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">分类</span>
            <DarkSelect
              value={draft.category}
              options={(categories.length ? categories : ["自定义"]).map(
                (item) => ({ value: item, label: item }),
              )}
              onChange={(next) => onChange({ ...draft, category: next })}
              buttonClassName="rounded-lg bg-input py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">问法内容</span>
            <textarea
              value={draft.prompt}
              onChange={(event) =>
                onChange({ ...draft, prompt: event.target.value })
              }
              placeholder="例如：统计本月放款金额合计"
              rows={4}
              className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 text-sm leading-6 text-foreground outline-none focus:border-brand/30"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving || !draft.label.trim() || !draft.prompt.trim()}
            onClick={onSave}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-border bg-elevated p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-foreground">删除模板？</h2>
        <p className="mt-2 text-xs leading-5 text-muted">
          确认删除「{label}」？删除后不可恢复。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:bg-surface-hover hover:text-foreground"
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

export function TeamTemplatesManagement() {
  const [templates, setTemplates] = useState<TeamTemplateItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("全部");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [total, setTotal] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TeamTemplateItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [favoritingId, setFavoritingId] = useState<string | null>(null);

  const editableCategories = useMemo(
    () => managedCategories.filter((item) => item !== MY_FAVORITES_CATEGORY),
    [managedCategories],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort: "popular",
        page: String(page),
        pageSize: String(pageSize),
      });
      if (query.trim()) {
        params.set("q", query.trim());
      }
      if (category !== "全部") {
        params.set("category", category);
      }

      const [templatesResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/templates?${params.toString()}`),
        fetch("/api/template-categories"),
      ]);

      if (templatesResponse.ok) {
        const data = (await templatesResponse.json()) as {
          templates?: TeamTemplateItem[];
          total?: number;
          page?: number;
          pageSize?: number;
          categories?: string[];
          canManage?: boolean;
        };

        setTemplates(data.templates ?? []);
        setTotal(data.total ?? 0);
        setCategories(data.categories ?? []);
        setCanManage(Boolean(data.canManage));

        if (data.page && data.page !== page) {
          setPage(data.page);
        }
      }

      if (categoriesResponse.ok) {
        const data = (await categoriesResponse.json()) as {
          categories?: Array<{ name: string }>;
        };
        const names = (data.categories ?? []).map((item) => item.name);
        setManagedCategories(names);
      }
    } finally {
      setLoading(false);
    }
  }, [category, page, pageSize, query]);

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
    setEditingId(null);
    setDraft({
      ...emptyDraft(),
      category: editableCategories[0] ?? "自定义",
    });
    setModalOpen(true);
  }

  function openEditModal(item: TeamTemplateItem) {
    setEditingId(item.id);
    setDraft({
      label: item.label,
      prompt: item.prompt,
      category: item.category ?? "自定义",
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }
    setModalOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
  }

  async function handleSave() {
    if (!draft.label.trim() || !draft.prompt.trim()) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        label: draft.label.trim(),
        prompt: draft.prompt.trim(),
        category: draft.category.trim() || "自定义",
      };

      const response = await fetch("/api/templates", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId ? { id: editingId, ...payload } : payload,
        ),
      });

      if (response.ok) {
        setModalOpen(false);
        setEditingId(null);
        setDraft(emptyDraft());
        await refresh();
      }
    } finally {
      setSaving(false);
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
      if (response.ok) {
        await refresh();
      }
    } finally {
      setFavoritingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    try {
      await fetch(`/api/templates?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      setDeleteTarget(null);
      await refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 shrink-0">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-brand-soft"
        >
          <span aria-hidden>←</span>
          返回数据智能体
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">团队模板</h1>
        <p className="mt-1 text-sm text-muted">
          管理团队常用问法；点击星标可将问法放入个人「我的收藏」。
        </p>
      </div>

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex min-w-[280px] flex-1 items-stretch overflow-hidden rounded-xl border border-border bg-surface focus-within:border-brand/30">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="按名称或问法搜索"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-foreground outline-none"
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
            className="inline-flex shrink-0 items-center gap-1.5 border-l border-border px-4 text-sm text-foreground transition hover:bg-surface-hover hover:text-foreground"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
              aria-hidden
            >
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M13.5 13.5 17 17"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            搜索
          </button>
        </div>

        <DarkSelect
          value={category}
          options={[
            { value: "全部", label: "全部分类" },
            ...categories.map((item) => ({ value: item, label: item })),
          ]}
          onChange={(next) => {
            setCategory(next);
            setPage(1);
          }}
          className="w-44 shrink-0"
        />

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition hover:border-border-strong hover:text-foreground"
        >
          刷新
        </button>

        {canManage ? (
          <>
            <Link
              href="/templates/categories"
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition hover:border-border-strong hover:text-foreground"
            >
              分类管理
            </Link>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              <span aria-hidden>+</span>
              新建模板
            </button>
          </>
        ) : null}
      </div>

      <div className="ui-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {loading ? (
          <p className="px-5 py-12 text-center text-sm text-muted">加载中…</p>
        ) : templates.length ? (
          <ul className="divide-y divide-border">
            {templates.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 transition hover:bg-surface-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-hover text-[10px] font-semibold uppercase text-muted">
                        QA
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] text-sky-300">
                            {templateTypeLabel(item)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                          {item.prompt}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <span>触发 {item.useCount ?? 0} 次</span>
                          <span>分类 {item.category ?? "通用"}</span>
                          <Link
                            href={`/agents?templateId=${encodeURIComponent(item.id)}`}
                            className="transition hover:text-brand-soft"
                          >
                            去提问 ↗
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">
                      可用
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      最近使用 {formatDateTime(item.lastUsedAt)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      创建 {formatDateTime(item.createdAt)}
                    </span>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <TemplateFavoriteButton
                        favorited={item.favorited}
                        disabled={favoritingId === item.id}
                        onToggle={() => void handleFavorite(item)}
                      />
                      {canManage && item.category !== MY_FAVORITES_CATEGORY ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="text-muted transition hover:text-foreground"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="text-muted transition hover:text-rose-300"
                          >
                            删除
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-muted">
            暂无匹配模板
          </p>
        )}
        </div>
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          第 {rangeStart}-{rangeEnd} 条，共 {total} 条
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted">
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
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground disabled:opacity-40"
            >
              上一页
            </button>
            <span className="min-w-12 text-center text-xs text-muted">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <TemplateFormModal
        open={modalOpen}
        title={editingId ? "编辑模板" : "新建模板"}
        draft={draft}
        saving={saving}
        categories={
          editableCategories.length
            ? editableCategories
            : categories.filter((item) => item !== MY_FAVORITES_CATEGORY)
        }
        onChange={setDraft}
        onClose={closeModal}
        onSave={() => void handleSave()}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        label={deleteTarget?.label ?? ""}
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

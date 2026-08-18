"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BackChevronIcon } from "@/components/back-chevron-icon";

type CategoryItem = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  createdAt: string;
  templateCount?: number;
  protected?: boolean;
};

type Draft = {
  name: string;
  description: string;
  sortOrder: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  sortOrder: "0",
});

function CategoryFormModal({
  open,
  title,
  draft,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: Draft;
  saving: boolean;
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
        className="w-full max-w-lg rounded-2xl border border-border bg-elevated shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          <p className="mt-1 text-xs text-muted">
            分类名称会用于模板筛选与新建时的下拉选择。
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">分类名称</span>
            <input
              value={draft.name}
              onChange={(event) =>
                onChange({ ...draft, name: event.target.value })
              }
              placeholder="例如：金融"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-brand/30"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">说明（可选）</span>
            <input
              value={draft.description}
              onChange={(event) =>
                onChange({ ...draft, description: event.target.value })
              }
              placeholder="例如：贷款、放款相关问法"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-brand/30"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">排序值</span>
            <input
              type="number"
              min={0}
              value={draft.sortOrder}
              onChange={(event) =>
                onChange({ ...draft, sortOrder: event.target.value })
              }
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-brand/30"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              数值越小越靠前
            </span>
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
            disabled={saving || !draft.name.trim()}
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

export function TeamTemplateCategoriesManagement() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/template-categories");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        categories?: CategoryItem[];
        canManage?: boolean;
      };
      setCategories(data.categories ?? []);
      setCanManage(Boolean(data.canManage));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = categories.filter((item) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(keyword) ||
      (item.description ?? "").toLowerCase().includes(keyword)
    );
  });

  function openCreateModal() {
    setEditingId(null);
    setDraft(emptyDraft());
    setErrorMessage(null);
    setModalOpen(true);
  }

  function openEditModal(item: CategoryItem) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      description: item.description ?? "",
      sortOrder: String(item.sortOrder),
    });
    setErrorMessage(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }
    setModalOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setErrorMessage(null);
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        sortOrder: Number.parseInt(draft.sortOrder, 10) || 0,
      };

      const response = await fetch("/api/template-categories", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId ? { id: editingId, ...payload } : payload,
        ),
      });

      if (response.ok) {
        closeModal();
        await refresh();
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setErrorMessage(data.error ?? "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/template-categories?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );
      if (response.ok) {
        setDeleteTarget(null);
        await refresh();
      } else {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setErrorMessage(data.error ?? "删除失败");
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 shrink-0">
        <Link
          href="/templates"
          className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-brand-soft"
        >
          <BackChevronIcon />
          返回模板列表
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">分类管理</h1>
        <p className="mt-1 text-sm text-muted">
          维护团队模板分类。「我的收藏」为固定分类，用于个人收藏问法。
        </p>
      </div>

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex min-w-60 flex-1 items-stretch overflow-hidden rounded-xl border border-border bg-surface focus-within:border-brand/30">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="按分类名称搜索"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-foreground outline-none"
          />
          <button
            type="button"
            aria-label="搜索"
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

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition hover:border-border-strong hover:text-foreground"
        >
          刷新
        </button>

        {canManage ? (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            <span aria-hidden>+</span>
            新建分类
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="ui-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {loading ? (
          <p className="px-5 py-12 text-center text-sm text-muted">加载中…</p>
        ) : filtered.length ? (
          <ul className="divide-y divide-border">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <span className="rounded-full border border-brand/20 bg-brand/10 px-2 py-0.5 text-[10px] text-brand-soft">
                      {item.templateCount ?? 0} 条模板
                    </span>
                    {item.protected ? (
                      <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
                        固定分类
                      </span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-xs text-muted">{item.description}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    排序 {item.sortOrder}
                  </p>
                </div>

                {canManage && !item.protected ? (
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="text-muted transition hover:text-foreground"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setDeleteTarget(item);
                      }}
                      className="text-muted transition hover:text-rose-300"
                    >
                      删除
                    </button>
                  </div>
                ) : item.protected ? (
                  <p className="text-[11px] text-muted-foreground">不可删除</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-muted">
            暂无分类
          </p>
        )}
        </div>
      </div>

      <CategoryFormModal
        open={modalOpen}
        title={editingId ? "编辑分类" : "新建分类"}
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={closeModal}
        onSave={() => void handleSave()}
      />

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          role="presentation"
          onClick={() => {
            if (!deleting) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-border bg-elevated p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-sm font-medium text-foreground">删除分类？</h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              确认删除「{deleteTarget.name}」？
              {(deleteTarget.templateCount ?? 0) > 0
                ? `该分类下还有 ${deleteTarget.templateCount} 条模板，无法删除。`
                : "删除后不可恢复。"}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:bg-surface-hover hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting || (deleteTarget.templateCount ?? 0) > 0}
                className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-40"
              >
                {deleting ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type TeamTemplateItem = {
  id: string;
  label: string;
  prompt: string;
  createdAt: string;
  createdBy: string;
  builtin?: boolean;
};

export function AgentTeamTemplatesPanel({
  currentPrompt,
  onSelect,
}: {
  currentPrompt: string;
  onSelect: (prompt: string) => void;
}) {
  const [templates, setTemplates] = useState<TeamTemplateItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/templates");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        templates?: TeamTemplateItem[];
        canManage?: boolean;
      };
      setTemplates(data.templates ?? []);
      setCanManage(Boolean(data.canManage));
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

  async function handlePublish() {
    if (!currentPrompt.trim()) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/templates", {
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
    await fetch(`/api/templates?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  return (
    <div className="ui-panel p-3">
      <p className="text-[11px] font-medium text-zinc-400">团队问法模板</p>
      <p className="mt-1 text-[10px] text-zinc-600">
        全员可用；管理员可发布自定义口径
      </p>

      {canManage ? (
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
            onClick={() => void handlePublish()}
            className="shrink-0 rounded-full border border-brand/30 px-2.5 py-1 text-[11px] text-brand-soft transition hover:bg-brand/10 disabled:opacity-40"
          >
            发布
          </button>
        </div>
      ) : null}

      {templates.length ? (
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          {templates.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-2"
            >
              <button
                type="button"
                onClick={() => onSelect(item.prompt)}
                className="w-full text-left"
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-slate-200">{item.label}</p>
                  {item.builtin ? (
                    <span className="text-[9px] uppercase tracking-wide text-slate-600">
                      内置
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">
                  {item.prompt}
                </p>
              </button>
              {canManage && !item.builtin ? (
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  className="mt-1 text-[10px] text-slate-600 transition hover:text-rose-300"
                >
                  删除
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-slate-600">暂无团队模板</p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BackChevronIcon } from "@/components/back-chevron-icon";
import { DarkSelect } from "@/components/dark-select";

import { getDefaultTestArgs } from "@/lib/agent/tool-test-defaults";
import {
  formatAgentToolTestResultReport,
  formatAgentToolsBatchTestReport,
} from "@/lib/agent/tool-test-report";
import { parseSseBlockData, takeSseBlocks } from "@/lib/sse";

const TOOL_KIND_OPTIONS = [
  { value: "all", label: "全部类型" },
  { value: "builtin", label: "内置" },
  { value: "http", label: "HTTP 自定义" },
  { value: "disabled", label: "已停用" },
] as const;

const HTTP_METHOD_SELECT_OPTIONS = [
  { value: "GET", label: "GET", mono: true },
  { value: "POST", label: "POST", mono: true },
] as const;

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

type ToolTestResult = {
  name: string;
  label: string;
  ok: boolean;
  durationMs: number;
  output?: string;
  error?: string;
  warning?: string;
};

type BatchToolTestItemState = {
  name: string;
  label: string;
  status: "pending" | "testing" | "done";
  result?: ToolTestResult;
};

function TestStatusSpinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand-soft"
      aria-hidden
    />
  );
}

function BatchToolTestProgressPanel({
  items,
  testing,
}: {
  items: BatchToolTestItemState[];
  testing: boolean;
}) {
  const doneCount = items.filter((item) => item.status === "done").length;
  const passedCount = items.filter((item) => item.result?.ok).length;
  const failedCount = doneCount - passedCount;
  const testingCount = items.filter((item) => item.status === "testing").length;
  const progressComplete = !testing && doneCount === items.length && items.length > 0;
  const progressBarClass = progressComplete
    ? failedCount === 0
      ? "bg-emerald-400/80"
      : "bg-amber-400/80"
    : "bg-brand/70";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">批量测试进度</p>
          <p className="font-mono text-xs text-muted">
            {doneCount} / {items.length}
            {testing ? ` · 进行中 ${testingCount}` : " · 已完成"}
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progressBarClass}`}
            style={{
              width: `${items.length ? Math.round((doneCount / items.length) * 100) : 0}%`,
            }}
          />
        </div>
        {doneCount > 0 ? (
          <p className="mt-2 text-xs text-muted">
            通过 {passedCount} · 失败 {failedCount}
          </p>
        ) : testing ? (
          <p className="mt-2 text-xs text-muted">正在逐个测试工具，请稍候…</p>
        ) : null}
      </div>

      <ul className="max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto pr-1">
        {items.map((entry) => (
          <li
            key={entry.name}
            className={`rounded-lg border px-3 py-2.5 text-xs transition-colors ${
              entry.status === "done"
                ? entry.result?.ok
                  ? "border-emerald-400/20 bg-emerald-400/5"
                  : "border-rose-400/20 bg-rose-400/5"
                : entry.status === "testing"
                  ? "border-brand/25 bg-brand/5"
                  : "border-border bg-elevated/40"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex w-4 justify-center">
                {entry.status === "testing" ? (
                  <TestStatusSpinner />
                ) : entry.status === "done" ? (
                  <span
                    className={
                      entry.result?.ok ? "text-emerald-300" : "text-rose-300"
                    }
                    aria-hidden
                  >
                    {entry.result?.ok ? "✓" : "✕"}
                  </span>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-muted/50" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{entry.label}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted">{entry.name}</p>
                {entry.status === "testing" ? (
                  <p className="mt-1 text-brand-soft">测试中…</p>
                ) : null}
                {entry.status === "pending" ? (
                  <p className="mt-1 text-muted">等待中</p>
                ) : null}
                {entry.result ? (
                  <p className="mt-1 text-muted">
                    {entry.result.ok ? "通过" : "失败"} · {entry.result.durationMs}ms
                    {entry.result.warning ? ` · ${entry.result.warning}` : ""}
                    {entry.result.error ? ` · ${entry.result.error}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
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

function formatToolMetaLine(item: ManagedToolItem) {
  const parts: string[] = [];
  if (Object.keys(item.args).length) {
    parts.push(
      Object.entries(item.args)
        .map(([key, value]) => `${key}:${value}`)
        .join(" · "),
    );
  } else {
    parts.push("无参数");
  }
  if (item.http?.url) {
    parts.push(`${item.http.method} ${item.http.url}`);
  }
  return parts.join(" · ");
}

function CopyableReportBlock({
  title,
  text,
  hint,
  tone = "default",
  rows = 16,
}: {
  title: string;
  text: string;
  hint: string;
  tone?: "default" | "success" | "warning";
  rows?: number;
}) {
  const [copied, setCopied] = useState(false);
  const containerTone =
    tone === "success"
      ? "border-emerald-400/25 bg-emerald-400/5"
      : tone === "warning"
        ? "border-amber-400/25 bg-amber-400/5"
        : "border-brand/20 bg-brand/5";

  async function copy() {
    if (!text.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${containerTone}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg border border-border bg-elevated px-3 py-1 text-[11px] text-muted transition hover:border-brand/30 hover:text-brand-soft"
        >
          {copied ? "已复制" : "复制给 AI"}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-muted">{hint}</p>
      <textarea
        readOnly
        value={text}
        rows={rows}
        aria-label={title}
        className="w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground outline-none"
      />
    </div>
  );
}

function ToolFormModal({
  open,
  title,
  draft,
  saving,
  httpEditable,
  error,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: Draft;
  saving: boolean;
  httpEditable: boolean;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-form-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-elevated shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id="tool-form-title" className="text-base font-medium text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted">
            修改 Agent 看到的展示名、说明、参数提示与启停。工具名不可改。大风车 HTTP 接口请到
            <Link href="/apis" className="text-brand-soft hover:text-brand">
              接口目录
            </Link>
            新增。
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-xs text-muted">
            工具名 <code className="text-foreground">{draft.name}</code>
          </p>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">展示名称</span>
            <input
              value={draft.label}
              onChange={(event) =>
                onChange({ ...draft, label: event.target.value })
              }
              placeholder="例如：按车牌查车辆"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-brand/30"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">说明（给 Agent 看）</span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                onChange({ ...draft, description: event.target.value })
              }
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 text-sm leading-6 text-foreground outline-none focus:border-brand/30"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">
              参数提示 JSON（如 {"{ \"plate\": \"string\" }"}）
            </span>
            <textarea
              value={draft.argsText}
              onChange={(event) =>
                onChange({ ...draft, argsText: event.target.value })
              }
              rows={4}
              className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none focus:border-brand/30"
            />
          </label>

          {httpEditable ? (
            <>
              <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                <div>
                  <span className="mb-1.5 block text-xs text-muted">方法</span>
                  <DarkSelect
                    value={draft.method}
                    options={[...HTTP_METHOD_SELECT_OPTIONS]}
                    onChange={(value) =>
                      onChange({
                        ...draft,
                        method: value === "POST" ? "POST" : "GET",
                      })
                    }
                    buttonClassName="rounded-lg bg-input py-2"
                  />
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-muted">
                    URL（可用 {"{{arg}}"}）
                  </span>
                  <input
                    value={draft.url}
                    onChange={(event) =>
                      onChange({ ...draft, url: event.target.value })
                    }
                    placeholder="https://crazyracing-kartrider.stable.dasouche.net/..."
                    className="w-full rounded-lg border border-border bg-input px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-brand/30"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted">Query 模板 JSON</span>
                <textarea
                  value={draft.queryText}
                  onChange={(event) =>
                    onChange({ ...draft, queryText: event.target.value })
                  }
                  rows={3}
                  placeholder='{"keywords":"{{plate}}"}'
                  className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none focus:border-brand/30"
                />
              </label>
              {draft.method === "POST" ? (
                <label className="block">
                  <span className="mb-1.5 block text-xs text-muted">Body 模板 JSON</span>
                  <textarea
                    value={draft.bodyText}
                    onChange={(event) =>
                      onChange({ ...draft, bodyText: event.target.value })
                    }
                    rows={4}
                    placeholder='{"keywords":"{{plate}}","objCode":"car"}'
                    className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none focus:border-brand/30"
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {!CORE_TOOLS.has(draft.name) ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
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
            <p className="text-xs text-muted">核心工具必须保持启用。</p>
          )}

          {error ? <p className="text-xs text-amber-400">{error}</p> : null}
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
            disabled={saving || !draft.label.trim() || !draft.description.trim()}
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

function ToolTestModal({
  open,
  tool,
  testing,
  allowExecuteSql,
  argsText,
  result,
  batchItems,
  error,
  onChangeArgs,
  onChangeAllowExecuteSql,
  onClose,
  onRun,
}: {
  open: boolean;
  tool: ManagedToolItem | null;
  testing: boolean;
  allowExecuteSql: boolean;
  argsText: string;
  result: ToolTestResult | null;
  batchItems: BatchToolTestItemState[] | null;
  error: string | null;
  onChangeArgs: (value: string) => void;
  onChangeAllowExecuteSql: (value: boolean) => void;
  onClose: () => void;
  onRun: () => void;
}) {
  const singleReportText = useMemo(
    () => (result ? formatAgentToolTestResultReport(result) : ""),
    [result],
  );
  const batchReportText = useMemo(() => {
    const results =
      batchItems
        ?.filter((item) => item.status === "done" && item.result)
        .map((item) => item.result!) ?? [];
    return results.length ? formatAgentToolsBatchTestReport(results) : "";
  }, [batchItems]);
  const batchReportResults =
    batchItems
      ?.filter((item) => item.status === "done" && item.result)
      .map((item) => item.result!) ?? [];
  const batchReportTone =
    batchReportResults.length > 0 && batchReportResults.every((entry) => entry.ok)
      ? "success"
      : "warning";

  if (!open) {
    return null;
  }

  const title = tool
    ? `测试工具 · ${tool.label}`
    : batchItems?.length
      ? `批量测试 (${batchItems.filter((entry) => entry.status === "done").length}/${batchItems.length})`
      : "批量测试结果";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          {tool ? (
            <p className="mt-1 font-mono text-xs text-muted">{tool.name}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {tool ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted">测试参数 JSON</span>
                <textarea
                  value={argsText}
                  onChange={(event) => onChangeArgs(event.target.value)}
                  rows={8}
                  className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none focus:border-brand/30"
                />
              </label>
              {tool.name === "execute_sql" ? (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={allowExecuteSql}
                    onChange={(event) => onChangeAllowExecuteSql(event.target.checked)}
                  />
                  允许执行 SQL（仅测试环境）
                </label>
              ) : null}
            </>
          ) : null}

          {error ? <p className="text-xs text-amber-400">{error}</p> : null}

          {batchItems?.length ? (
            <BatchToolTestProgressPanel items={batchItems} testing={testing} />
          ) : null}

          {result ? (
            <div
              className={`rounded-xl border px-4 py-3 text-xs ${
                result.ok
                  ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"
                  : "border-rose-400/20 bg-rose-400/5 text-rose-200"
              }`}
            >
              <p className="font-medium">
                {result.ok ? "通过" : "失败"} · {result.durationMs}ms
              </p>
              {result.warning ? (
                <p className="mt-1 text-muted">{result.warning}</p>
              ) : null}
              {result.error ? <p className="mt-1">{result.error}</p> : null}
              {result.output ? (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-foreground">
                  {result.output}
                </pre>
              ) : null}
            </div>
          ) : null}

          {batchReportText && !testing ? (
            <CopyableReportBlock
              title="批量测试 AI 报告"
              hint="结构化 Markdown 报告，包含工具名、output、data 与排查提示，可直接粘贴给 AI 协助修复。"
              tone={batchReportTone}
              text={batchReportText}
              rows={18}
            />
          ) : null}

          {singleReportText && tool && !testing ? (
            <CopyableReportBlock
              title="单工具测试 AI 报告"
              hint="结构化 Markdown 报告，包含工具 output、data 与排查提示，可直接粘贴给 AI 协助修复。"
              text={singleReportText}
              rows={16}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={testing}
            className="rounded-lg px-4 py-2 text-sm text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
          >
            {testing ? "测试进行中…" : "关闭"}
          </button>
          {tool ? (
            <button
              type="button"
              disabled={testing}
              onClick={onRun}
              className="rounded-lg bg-brand/20 px-4 py-2 text-sm font-medium text-brand-soft transition hover:bg-brand/30 disabled:opacity-40"
            >
              {testing ? "测试中…" : "运行测试"}
            </button>
          ) : null}
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
  const [editingHttp, setEditingHttp] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testingTool, setTestingTool] = useState<ManagedToolItem | null>(null);
  const [testArgsText, setTestArgsText] = useState("{}");
  const [allowExecuteSql, setAllowExecuteSql] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ToolTestResult | null>(null);
  const [batchTestItems, setBatchTestItems] = useState<BatchToolTestItemState[] | null>(
    null,
  );
  const [testError, setTestError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const pageNames = useMemo(() => tools.map((item) => item.name), [tools]);
  const allPageSelected =
    pageNames.length > 0 && pageNames.every((name) => selectedNames.has(name));

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

  function toggleSelectAllPage() {
    setSelectedNames((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        for (const name of pageNames) {
          next.delete(name);
        }
      } else {
        for (const name of pageNames) {
          next.add(name);
        }
      }
      return next;
    });
  }

  function toggleSelect(name: string) {
    setSelectedNames((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function openEditModal(item: ManagedToolItem) {
    setEditingId(item.id);
    setEditingHttp(item.kind === "http");
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

  function openTestModal(item: ManagedToolItem) {
    setTestingTool(item);
    setTestArgsText(
      prettyJson(getDefaultTestArgs(item.name, item)) || "{}",
    );
    setAllowExecuteSql(false);
    setTestResult(null);
    setBatchTestItems(null);
    setTestError(null);
    setTestModalOpen(true);
  }

  function closeTestModal() {
    if (testing) {
      return;
    }
    setTestModalOpen(false);
    setTestingTool(null);
    setTestResult(null);
    setBatchTestItems(null);
    setTestError(null);
  }

  function resolveBatchToolMeta(name: string) {
    const tool = tools.find((entry) => entry.name === name);
    return {
      label: tool?.label ?? name,
    };
  }

  function markBatchTesting(name: string) {
    setBatchTestItems((current) =>
      current?.map((entry) =>
        entry.name === name ? { ...entry, status: "testing" } : entry,
      ) ?? null,
    );
  }

  function markBatchDone(result: ToolTestResult) {
    setBatchTestItems((current) =>
      current?.map((entry) =>
        entry.name === result.name
          ? {
              ...entry,
              status: "done",
              label: result.label || entry.label,
              result,
            }
          : entry,
      ) ?? null,
    );
  }

  async function consumeBatchTestStream(response: Response) {
    if (!response.body) {
      throw new Error("批量测试流不可用");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parsed = takeSseBlocks(buffer);
      buffer = parsed.rest;

      for (const block of parsed.blocks) {
        const event = parseSseBlockData(block);
        if (!event) {
          continue;
        }

        if (event.event === "testing") {
          const name = (event.payload as { name?: string }).name;
          if (name) {
            markBatchTesting(name);
          }
        } else if (event.event === "result") {
          const result = (event.payload as { result?: ToolTestResult }).result;
          if (result) {
            markBatchDone(result);
          }
        } else if (event.event === "error") {
          const message = (event.payload as { error?: string }).error;
          throw new Error(message ?? "批量测试失败");
        }
      }
    }
  }

  async function runSingleTest() {
    if (!testingTool) {
      return;
    }

    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const args = parseJsonObject(testArgsText, "测试参数");
      const response = await fetch("/api/agent-tools/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: testingTool.name,
          args,
          allowExecuteSql,
        }),
      });
      const payload = (await response.json()) as {
        result?: ToolTestResult;
        error?: string;
      };
      if (!response.ok) {
        setTestError(payload.error ?? "测试失败");
        return;
      }
      setTestResult(payload.result ?? null);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "测试失败");
    } finally {
      setTesting(false);
    }
  }

  async function runBatchTest() {
    const names = [...selectedNames];
    if (!names.length) {
      return;
    }

    setTesting(true);
    setTestError(null);
    setTestResult(null);
    setBatchTestItems(
      names.map((name) => ({
        name,
        ...resolveBatchToolMeta(name),
        status: "pending" as const,
      })),
    );
    setTestingTool(null);
    setTestModalOpen(true);

    try {
      const response = await fetch("/api/agent-tools/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, stream: true }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setTestError(payload.error ?? "批量测试失败");
        return;
      }

      await consumeBatchTestStream(response);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "批量测试失败");
    } finally {
      setTesting(false);
    }
  }

  function closeModal() {
    if (saving) {
      return;
    }
    setModalOpen(false);
    setEditingId(null);
    setEditingHttp(false);
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          label: draft.label.trim(),
          description: draft.description.trim(),
          args,
          enabled: draft.enabled,
          http:
            editingHttp && (draft.url.trim() || queryTemplate || bodyTemplate)
              ? {
                  method: draft.method,
                  url: draft.url.trim(),
                  queryTemplate,
                  bodyTemplate,
                }
              : undefined,
        }),
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
          className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-brand-soft"
        >
          <BackChevronIcon />
          返回数据智能体
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">工具管理</h1>
        <p className="mt-1 text-sm text-muted">
          管理 Agent 可调用的工具：展示名、说明、启停与连通性测试。大风车 HTTP 接口请到接口目录新增，Agent 经 route_api / call_backend_api 调用。
        </p>
      </div>

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex min-w-[280px] flex-1 items-stretch overflow-hidden rounded-xl border border-border bg-surface focus-within:border-brand/30">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="按名称、工具名或说明搜索"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-foreground outline-none"
          />
        </div>

        <DarkSelect
          value={kind}
          options={[...TOOL_KIND_OPTIONS]}
          onChange={(value) => {
            setKind(value);
            setPage(1);
          }}
          className="w-36 shrink-0"
        />

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition hover:border-border-strong hover:text-foreground"
        >
          刷新
        </button>

        {canManage && selectedNames.size > 0 ? (
          <button
            type="button"
            disabled={testing}
            onClick={() => void runBatchTest()}
            className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm text-brand-soft transition hover:bg-brand/20 disabled:opacity-40"
          >
            {testing ? "测试中…" : `批量测试 (${selectedNames.size})`}
          </button>
        ) : null}

        {canManage ? (
          <Link
            href="/apis"
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            去接口目录新增
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 text-sm text-amber-400">{error}</p>
      ) : null}

      <div className="ui-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {loading ? (
            <p className="px-5 py-12 text-center text-sm text-muted">加载中…</p>
          ) : tools.length ? (
            <ul className="divide-y divide-border">
              {canManage ? (
                <li className="flex items-center gap-3 px-5 py-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAllPage}
                    aria-label="全选当前页"
                  />
                  <span>全选当前页</span>
                </li>
              ) : null}
              {tools.map((item) => {
                const metaLine = formatToolMetaLine(item);
                return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 transition hover:bg-surface-hover"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {canManage ? (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedNames.has(item.name)}
                        onChange={() => toggleSelect(item.name)}
                        aria-label={`选择 ${item.label}`}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <span className="rounded-full border border-border bg-surface-hover px-2 py-0.5 font-mono text-[10px] text-muted">
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
                              : "border-slate-500/30 bg-slate-500/10 text-muted"
                          }`}
                        >
                          {item.enabled ? "启用" : "停用"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                        {item.description}
                      </p>
                      <p
                        className="mt-2 truncate font-mono text-[11px] text-muted-foreground"
                        title={metaLine}
                      >
                        {metaLine}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                    <span className="text-[11px] text-muted-foreground">
                      更新 {formatDateTime(item.updatedAt)}
                    </span>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => openTestModal(item)}
                          className="text-brand-soft transition hover:text-brand"
                        >
                          测试
                        </button>
                      ) : null}
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="text-muted transition hover:text-foreground"
                        >
                          编辑
                        </button>
                      ) : null}
                      {canManage && !CORE_TOOLS.has(item.name) ? (
                        <button
                          type="button"
                          onClick={() => void toggleEnabled(item)}
                          className="text-muted transition hover:text-foreground"
                        >
                          {item.enabled ? "停用" : "启用"}
                        </button>
                      ) : null}
                      {canManage && !item.builtin ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          className="text-muted transition hover:text-rose-300"
                        >
                          删除
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-muted">
              暂无匹配工具
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          第 {rangeStart}-{rangeEnd} 条，共 {total} 条
          {selectedNames.size > 0 ? ` · 已选 ${selectedNames.size} 项` : ""}
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
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
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
            className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      <ToolFormModal
        open={modalOpen}
        title="编辑工具"
        draft={draft}
        saving={saving}
        httpEditable={editingHttp}
        error={formError}
        onChange={setDraft}
        onClose={closeModal}
        onSave={() => void handleSave()}
      />

      <ToolTestModal
        open={testModalOpen}
        tool={testingTool}
        testing={testing}
        allowExecuteSql={allowExecuteSql}
        argsText={testArgsText}
        result={testResult}
        batchItems={batchTestItems}
        error={testError}
        onChangeArgs={setTestArgsText}
        onChangeAllowExecuteSql={setAllowExecuteSql}
        onClose={closeTestModal}
        onRun={() => void runSingleTest()}
      />
    </div>
  );
}

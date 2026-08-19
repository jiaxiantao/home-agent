"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatDfcApiBatchTestReport,
  formatDfcApiTestResultReport,
} from "@/lib/analytics/api-endpoint-test-report";
import {
  HTTP_METHOD_OPTIONS,
  httpMethodUsesBodyPanel,
  normalizeHttpMethod,
  type HttpMethod,
} from "@/lib/analytics/http-methods";
import { parseSseBlockData, takeSseBlocks } from "@/lib/sse";
import { BackChevronIcon } from "@/components/back-chevron-icon";
import { DarkSelect } from "@/components/dark-select";

type DfcApiAppSummary = {
  appCode: string;
  total: number;
  httpCount: number;
  dubboCount: number;
};

type DfcAppRegistryOption = {
  appCode: string;
  repo: string;
  database: string;
  baseUrlEnvKey: string;
  defaultDomain: string;
  envConfigured: boolean;
};

type DfcApiItem = {
  id: string;
  appCode: string;
  kind: "http" | "dubbo";
  title: string;
  description: string;
  readOnly: boolean;
  httpPath?: string;
  httpMethod?: string;
  dubboInterface?: string;
  dubboMethod?: string;
  baseUrlEnvKey: string;
  defaultTestParams: Record<string, unknown>;
  defaultTestConfig?: {
    params: Record<string, unknown>;
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: Record<string, unknown>;
    cookies?: Record<string, string>;
  };
  seeded: boolean;
  enabled: boolean;
  agentCallCount: number;
  updatedAt?: string;
};

type DfcApiTestRequestPreview = {
  kind: "http" | "dubbo";
  method?: string;
  url?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  dubbo?: {
    interfaceName: string;
    method: string;
    params: Record<string, unknown>;
  };
  envConfigured: boolean;
  baseUrlEnvKey: string;
};

type DfcApiTestResult = {
  endpointId: string;
  title: string;
  kind: "http" | "dubbo";
  ok: boolean;
  durationMs: number;
  status: string;
  message: string;
  warning?: string;
  envConfigured?: boolean;
  request?: DfcApiTestRequestPreview;
  response?: {
    httpStatus?: number;
    headers?: Record<string, string>;
    body?: unknown;
  };
};

type TestPanelTab = "params" | "headers" | "cookies" | "body";

type BatchTestItemState = {
  endpointId: string;
  title: string;
  line: string;
  status: "pending" | "testing" | "done";
  result?: DfcApiTestResult;
};

function TestStatusSpinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand-soft"
      aria-hidden
    />
  );
}

type ApiDraft = {
  id: string;
  appCode: string;
  title: string;
  kind: "http" | "dubbo";
  description: string;
  readOnly: boolean;
  enabled: boolean;
  baseUrlEnvKey: string;
  httpMethod: HttpMethod;
  httpPath: string;
  dubboInterface: string;
  dubboMethod: string;
  testParamsText: string;
  testHeadersText: string;
  testQueryText: string;
  testBodyText: string;
  testCookiesText: string;
};

type FormPanelTab = "endpoint" | "params" | "headers" | "cookies" | "body";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

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

function parseJsonStringMap(text: string, label: string) {
  const parsed = parseJsonObject(text, label);
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]),
  ) as Record<string, string>;
}

function formatEndpointLine(
  item: Pick<
    DfcApiItem,
    "kind" | "httpMethod" | "httpPath" | "dubboInterface" | "dubboMethod"
  >,
) {
  if (item.kind === "http") {
    return `${item.httpMethod ?? "GET"} ${item.httpPath ?? ""}`;
  }
  return `${item.dubboInterface ?? ""}.${item.dubboMethod ?? ""}`;
}

function deriveDraftMeta(draft: ApiDraft) {
  const path = draft.httpPath.trim() || "/custom";
  const methodName =
    path
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/\.json$/i, "") || "custom";
  const httpMethod = draft.httpMethod;
  const id =
    draft.id.trim() ||
    (draft.kind === "http"
      ? `custom:http:${httpMethod}:${path}:${methodName}`
      : `custom:dubbo:${draft.dubboInterface.trim()}:${draft.dubboMethod.trim()}`);
  return {
    id,
    appCode: draft.appCode.trim() || "custom",
    title: draft.title.trim() || methodName,
    methodName,
  };
}

function buildTestConfigFromDraft(draft: ApiDraft) {
  return {
    params: parseJsonObject(draft.testParamsText, "入参"),
    headers: parseJsonStringMap(draft.testHeadersText, "请求头"),
    query: parseJsonStringMap(draft.testQueryText, "Query"),
    cookies: parseJsonStringMap(draft.testCookiesText, "Cookies"),
    body: draft.testBodyText.trim()
      ? (parseJsonObject(draft.testBodyText, "Body") as Record<string, unknown>)
      : undefined,
  };
}

function emptyDraft(registryApps: DfcAppRegistryOption[] = []): ApiDraft {
  const defaultApp =
    registryApps.find((item) => item.appCode === "super-mario") ??
    registryApps[0];
  return {
    id: "",
    appCode: defaultApp?.appCode ?? "",
    kind: "http",
    title: "",
    description: "",
    readOnly: true,
    enabled: true,
    baseUrlEnvKey: defaultApp?.baseUrlEnvKey ?? "DFC_API_GATEWAY_BASE_URL",
    httpMethod: "GET",
    httpPath: "",
    dubboInterface: "",
    dubboMethod: "",
    testParamsText: "{}",
    testHeadersText: "{}",
    testQueryText: "{}",
    testBodyText: "{}",
    testCookiesText: "{}",
  };
}

function draftFromItem(item: DfcApiItem): ApiDraft {
  const cfg = item.defaultTestConfig ?? {
    params: item.defaultTestParams ?? {},
    headers: {},
    query: {},
    cookies: {},
  };
  return {
    id: item.id,
    appCode: item.appCode,
    title: item.title,
    kind: item.kind,
    description: item.description,
    readOnly: item.readOnly,
    enabled: item.enabled,
    baseUrlEnvKey: item.baseUrlEnvKey,
    httpMethod: item.httpMethod ? normalizeHttpMethod(item.httpMethod) : "GET",
    httpPath: item.httpPath ?? "",
    dubboInterface: item.dubboInterface ?? "",
    dubboMethod: item.dubboMethod ?? "",
    testParamsText: prettyJson(cfg.params) || "{}",
    testHeadersText: prettyJson(cfg.headers) || "{}",
    testQueryText: prettyJson(cfg.query) || "{}",
    testBodyText: prettyJson(cfg.body) || "{}",
    testCookiesText: prettyJson(cfg.cookies) || "{}",
  };
}

function formatKind(kind: DfcApiItem["kind"]) {
  return kind === "http" ? "HTTP" : "Dubbo";
}

function buildServiceSelectOptions(
  registryApps: DfcAppRegistryOption[],
  catalogApps: DfcApiAppSummary[],
  currentAppCode?: string,
) {
  const byCode = new Map<string, DfcAppRegistryOption>();
  for (const item of registryApps) {
    byCode.set(item.appCode, item);
  }

  for (const app of catalogApps) {
    if (!byCode.has(app.appCode)) {
      byCode.set(app.appCode, {
        appCode: app.appCode,
        repo: app.appCode,
        database: "*",
        baseUrlEnvKey: `DFC_API_${app.appCode.replace(/-/g, "_").toUpperCase()}_BASE_URL`,
        defaultDomain: `https://${app.appCode}.dasouche.net`,
        envConfigured: false,
      });
    }
  }

  if (currentAppCode?.trim() && !byCode.has(currentAppCode)) {
    byCode.set(currentAppCode, {
      appCode: currentAppCode,
      repo: currentAppCode,
      database: "*",
      baseUrlEnvKey: `DFC_API_${currentAppCode.replace(/-/g, "_").toUpperCase()}_BASE_URL`,
      defaultDomain: `https://${currentAppCode}.dasouche.net`,
      envConfigured: false,
    });
  }

  return [...byCode.values()].sort((a, b) =>
    a.appCode.localeCompare(b.appCode, "zh-CN"),
  );
}

function ApiFormModal({
  open,
  title,
  draft,
  creating,
  saving,
  error,
  activeTab,
  registryApps,
  catalogApps,
  onChangeTab,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: ApiDraft;
  creating: boolean;
  saving: boolean;
  error: string | null;
  activeTab: FormPanelTab;
  registryApps: DfcAppRegistryOption[];
  catalogApps: DfcApiAppSummary[];
  onChangeTab: (tab: FormPanelTab) => void;
  onChange: (draft: ApiDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) {
    return null;
  }

  const endpointLine =
    draft.kind === "http"
      ? `${draft.httpMethod} ${draft.httpPath || "—"}`
      : `${draft.dubboInterface || "—"}.${draft.dubboMethod || "—"}`;

  const formTabs: { id: FormPanelTab; label: string }[] = [
    { id: "endpoint", label: "接口" },
    { id: "params", label: "入参" },
    { id: "headers", label: "请求头" },
    { id: "cookies", label: "Cookies" },
    {
      id: "body",
      label:
        draft.kind === "http" && !httpMethodUsesBodyPanel(draft.httpMethod)
          ? "Query"
          : "Body",
    },
  ];

  const canSave =
    Boolean(draft.appCode.trim()) &&
    (draft.kind === "http"
      ? Boolean(draft.httpPath.trim())
      : Boolean(draft.dubboInterface.trim() && draft.dubboMethod.trim()));

  const serviceOptions = buildServiceSelectOptions(
    registryApps,
    catalogApps,
    draft.appCode,
  );
  const selectedService =
    serviceOptions.find((item) => item.appCode === draft.appCode) ?? null;

  const serviceSelectOptions = serviceOptions.map((item) => ({
    value: item.appCode,
    label: item.appCode,
    badge: item.envConfigured ? "已配置" : "未配置",
    badgeTone: item.envConfigured ? ("success" as const) : ("warning" as const),
  }));

  function applyService(appCode: string) {
    const service =
      serviceOptions.find((item) => item.appCode === appCode) ??
      registryApps.find((item) => item.appCode === appCode);
    if (!service) {
      onChange({ ...draft, appCode });
      return;
    }
    onChange({
      ...draft,
      appCode: service.appCode,
      baseUrlEnvKey: service.baseUrlEnvKey,
    });
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
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          {!creating ? (
            <p className="mt-1 font-mono text-xs text-muted">{endpointLine}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex flex-wrap gap-1 border-b border-border">
            {formTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeTab(tab.id)}
                className={`rounded-t-lg px-3 py-1.5 text-xs transition ${
                  activeTab === tab.id
                    ? "bg-surface-hover text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "endpoint" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                <div>
                  <span className="mb-1.5 block text-xs text-muted">方法</span>
                  <DarkSelect
                    value={draft.httpMethod}
                    options={HTTP_METHOD_OPTIONS.map((item) => ({ ...item, mono: true }))}
                    onChange={(value) =>
                      onChange({
                        ...draft,
                        httpMethod: normalizeHttpMethod(value),
                      })
                    }
                  />
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-muted">Path</span>
                  <input
                    value={draft.httpPath}
                    onChange={(event) =>
                      onChange({ ...draft, httpPath: event.target.value })
                    }
                    placeholder="/v1/example/query.json"
                    className="w-full rounded-lg border border-border bg-input px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-brand/30"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs text-muted">说明（可选）</span>
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    onChange({ ...draft, description: event.target.value })
                  }
                  rows={2}
                  className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-brand/30"
                />
              </label>

              <div>
                <span className="mb-1.5 block text-xs text-muted">大风车服务</span>
                <DarkSelect
                  value={draft.appCode}
                  options={serviceSelectOptions}
                  searchable
                  searchPlaceholder="搜索服务名…"
                  placeholder="请选择服务"
                  onChange={applyService}
                />
                {selectedService ? (
                  <p className="mt-2 text-xs text-muted">
                    测试域名：
                    <span className="font-mono text-foreground">
                      {selectedService.defaultDomain}
                    </span>
                    {selectedService.envConfigured ? (
                      <span className="ml-2 text-emerald-400">（.env 已配置）</span>
                    ) : (
                      <span className="ml-2 text-amber-400">
                        （请在 .env 配置 {selectedService.baseUrlEnvKey}）
                      </span>
                    )}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.readOnly}
                    onChange={(event) =>
                      onChange({ ...draft, readOnly: event.target.checked })
                    }
                  />
                  只读
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) =>
                      onChange({ ...draft, enabled: event.target.checked })
                    }
                  />
                  启用
                </label>
              </div>
            </div>
          ) : null}

          {activeTab === "params" ? (
            <JsonBlock
              label="默认入参 JSON（phone / recordId / plate 等业务参数）"
              value={draft.testParamsText}
              rows={10}
              onChange={(value) => onChange({ ...draft, testParamsText: value })}
            />
          ) : null}

          {activeTab === "headers" ? (
            <JsonBlock
              label="默认请求头 JSON（如 Souche-Security-Token、_source_code）"
              value={draft.testHeadersText}
              rows={10}
              onChange={(value) => onChange({ ...draft, testHeadersText: value })}
            />
          ) : null}

          {activeTab === "cookies" ? (
            <JsonBlock
              label='默认 Cookies JSON（如 {"_security_token": "..."}）'
              value={draft.testCookiesText}
              rows={10}
              onChange={(value) => onChange({ ...draft, testCookiesText: value })}
            />
          ) : null}

          {activeTab === "body" ? (
            draft.kind === "http" && !httpMethodUsesBodyPanel(draft.httpMethod) ? (
              <JsonBlock
                label="默认 Query JSON（URL 查询参数）"
                value={draft.testQueryText}
                rows={10}
                onChange={(value) => onChange({ ...draft, testQueryText: value })}
              />
            ) : (
              <JsonBlock
                label="默认 Body JSON（POST / PUT / PATCH / DELETE 请求体）"
                value={draft.testBodyText}
                rows={10}
                onChange={(value) => onChange({ ...draft, testBodyText: value })}
              />
            )
          ) : null}

          {error ? <p className="mt-3 text-xs text-amber-400">{error}</p> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
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
            disabled={saving || !canSave}
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

function JsonBlock({
  label,
  value,
  rows = 6,
  readOnly = false,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        rows={rows}
        className={`w-full resize-y rounded-lg border border-border px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-brand/30 ${
          readOnly ? "bg-surface text-muted-foreground" : "bg-input text-foreground"
        }`}
      />
    </label>
  );
}

function CopyableReportBlock({
  title,
  text,
  tone = "default",
  rows = 16,
}: {
  title: string;
  text: string;
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
      <p className="mb-2 text-[11px] text-muted">
        结构化 Markdown 报告，包含 endpointId、请求、响应与排查提示，可直接粘贴给 AI 协助修复。
      </p>
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

function BatchTestProgressPanel({
  items,
  testing,
}: {
  items: BatchTestItemState[];
  testing: boolean;
}) {
  const doneCount = items.filter((item) => item.status === "done").length;
  const passedCount = items.filter((item) => item.result?.ok).length;
  const skippedCount = items.filter((item) => item.result?.status === "skipped").length;
  const failedCount = items.filter(
    (item) =>
      item.status === "done" &&
      item.result &&
      !item.result.ok &&
      item.result.status !== "skipped",
  ).length;
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
            通过 {passedCount}
            {skippedCount ? ` · 跳过 ${skippedCount}` : ""} · 失败 {failedCount}
          </p>
        ) : testing ? (
          <p className="mt-2 text-xs text-muted">正在逐个探测接口，请稍候…</p>
        ) : null}
      </div>

      <ul className="max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto pr-1">
        {items.map((entry) => (
          <li
            key={entry.endpointId}
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
                <p className="font-medium text-foreground">{entry.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted">{entry.line}</p>
                {entry.status === "testing" ? (
                  <p className="mt-1 text-brand-soft">测试中…</p>
                ) : null}
                {entry.status === "pending" ? (
                  <p className="mt-1 text-muted">等待中</p>
                ) : null}
                {entry.result ? (
                  <p className="mt-1 text-muted">
                    {entry.result.ok ? "通过" : "失败"} · {entry.result.durationMs}ms
                    {entry.result.response?.httpStatus != null
                      ? ` · HTTP ${entry.result.response.httpStatus}`
                      : ""}
                    {entry.result.message ? ` · ${entry.result.message}` : ""}
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

function ApiTestModal({
  open,
  item,
  testing,
  loadingPreview,
  activeTab,
  paramsText,
  headersText,
  queryText,
  bodyText,
  cookiesText,
  preview,
  result,
  batchResults,
  batchItems,
  error,
  onChangeTab,
  onChangeParams,
  onChangeHeaders,
  onChangeQuery,
  onChangeBody,
  onChangeCookies,
  onClose,
  onRun,
}: {
  open: boolean;
  item: DfcApiItem | null;
  testing: boolean;
  loadingPreview: boolean;
  activeTab: TestPanelTab;
  paramsText: string;
  headersText: string;
  queryText: string;
  bodyText: string;
  cookiesText: string;
  preview: DfcApiTestRequestPreview | null;
  result: DfcApiTestResult | null;
  batchResults: DfcApiTestResult[] | null;
  batchItems: BatchTestItemState[] | null;
  error: string | null;
  onChangeTab: (tab: TestPanelTab) => void;
  onChangeParams: (value: string) => void;
  onChangeHeaders: (value: string) => void;
  onChangeQuery: (value: string) => void;
  onChangeBody: (value: string) => void;
  onChangeCookies: (value: string) => void;
  onClose: () => void;
  onRun: () => void;
}) {
  const singleReportText = useMemo(
    () => (result ? formatDfcApiTestResultReport(result) : ""),
    [result],
  );
  const batchReportText = useMemo(
    () =>
      batchResults?.length ? formatDfcApiBatchTestReport(batchResults) : "",
    [batchResults],
  );
  const batchReportTone =
    batchResults?.length && batchResults.every((entry) => entry.ok)
      ? "success"
      : "warning";

  if (!open) {
    return null;
  }

  const title = item
    ? `测试 · ${formatEndpointLine(item)}`
    : batchItems?.length
      ? `批量测试 (${batchItems.filter((entry) => entry.status === "done").length}/${batchItems.length})`
      : "批量测试结果";
  const request = result?.request ?? preview;
  const isHttp = request?.kind === "http";
  const method = request?.method ?? item?.httpMethod ?? "GET";
  const usesBodyPanel = isHttp && httpMethodUsesBodyPanel(method);
  const url = request?.url ?? (item?.httpPath ? `…${item.httpPath}` : "—");
  const queryTextDisplay = queryText.trim() || prettyJson(request?.query) || "{}";
  const bodyTextDisplay = bodyText.trim() || prettyJson(request?.body) || "{}";
  const cookiesTextDisplay =
    cookiesText.trim() || prettyJson(request?.cookies) || "{}";
  const responseStatus = result?.response?.httpStatus;
  const responseHeadersText = prettyJson(result?.response?.headers) || "";
  const responseBodyText = result?.response?.body
    ? prettyJson(result.response.body)
    : "";

  const tabs: { id: TestPanelTab; label: string }[] = [
    { id: "params", label: "入参" },
    { id: "headers", label: "请求头" },
    { id: "cookies", label: "Cookies" },
    {
      id: "body",
      label:
        request?.kind === "dubbo"
          ? "Dubbo 入参"
          : usesBodyPanel
            ? "Body"
            : "Query",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          {item ? (
            <p className="mt-1 font-mono text-[11px] text-muted">{formatEndpointLine(item)}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {item ? (
            <>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="flex flex-wrap items-stretch gap-0 border-b border-border">
                  <span className="flex min-w-[4.5rem] items-center justify-center bg-brand/15 px-3 py-2 font-mono text-xs font-semibold text-brand-soft">
                    {method}
                  </span>
                  <div className="min-w-0 flex-1 px-3 py-2 font-mono text-xs leading-5 text-foreground">
                    {loadingPreview ? "加载请求预览…" : url}
                  </div>
                </div>
                {request?.kind === "dubbo" && request.dubbo ? (
                  <p className="border-t border-border px-3 py-2 font-mono text-[11px] text-muted">
                    {request.dubbo.interfaceName}.{request.dubbo.method}
                  </p>
                ) : null}
                {request && !request.envConfigured ? (
                  <p className="border-t border-border px-3 py-2 text-xs text-amber-400">
                    未配置 {request.baseUrlEnvKey}，HTTP 探测可能失败
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-2 flex flex-wrap gap-1 border-b border-border">
                  {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChangeTab(tab.id)}
                        className={`rounded-t-lg px-3 py-1.5 text-xs transition ${
                          activeTab === tab.id
                            ? "bg-surface-hover text-foreground"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                </div>

                {activeTab === "params" ? (
                  <JsonBlock
                    label="业务入参 JSON（phone / recordId / plate 等，合并进 URL Query 或 Body 模板）"
                    value={paramsText}
                    rows={8}
                    onChange={onChangeParams}
                  />
                ) : null}

                {activeTab === "headers" ? (
                  <JsonBlock
                    label="请求头 JSON"
                    value={headersText}
                    rows={8}
                    onChange={onChangeHeaders}
                  />
                ) : null}

                {activeTab === "cookies" ? (
                  <JsonBlock
                    label='Cookies JSON（如 {"_security_token": "..."}）'
                    value={cookiesTextDisplay}
                    rows={8}
                    onChange={onChangeCookies}
                  />
                ) : null}

                {activeTab === "body" ? (
                  isHttp && usesBodyPanel ? (
                    <JsonBlock
                      label="请求 Body JSON（来自数据库 default_test_config.body，可编辑）"
                      value={bodyTextDisplay}
                      rows={10}
                      onChange={onChangeBody}
                    />
                  ) : request?.kind === "dubbo" ? (
                    <JsonBlock
                      label="Dubbo 方法入参 JSON（来自数据库）"
                      value={bodyTextDisplay}
                      rows={10}
                      onChange={onChangeBody}
                    />
                  ) : (
                    <JsonBlock
                      label="Query 参数 JSON（来自数据库 default_test_config.query，可编辑）"
                      value={queryTextDisplay}
                      rows={10}
                      onChange={onChangeQuery}
                    />
                  )
                ) : null}
              </div>
            </>
          ) : null}

          {error ? <p className="text-xs text-amber-400">{error}</p> : null}

          {batchItems?.length ? (
            <BatchTestProgressPanel items={batchItems} testing={testing} />
          ) : null}

          {batchResults?.length && !testing ? (
            <CopyableReportBlock
              title="批量测试 AI 报告"
              tone={batchReportTone}
              text={batchReportText}
              rows={18}
            />
          ) : null}

          {result ? (
            <CopyableReportBlock
              title="单接口测试 AI 报告"
              text={singleReportText}
              rows={16}
            />
          ) : null}

          {result ? (
            <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-foreground">响应 Response</span>
                {responseStatus != null ? (
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono ${
                      responseStatus >= 200 && responseStatus < 300
                        ? "bg-emerald-400/10 text-emerald-300"
                        : "bg-rose-400/10 text-rose-300"
                    }`}
                  >
                    {responseStatus}
                  </span>
                ) : null}
                <span className="text-muted">{result.durationMs}ms</span>
                <span
                  className={
                    result.ok ? "text-emerald-300" : "text-rose-300"
                  }
                >
                  {result.ok ? "通过" : "失败"} · {result.status}
                </span>
              </div>
              <p className="text-xs text-foreground">{result.message}</p>
              {result.warning ? (
                <p className="text-xs text-muted">{result.warning}</p>
              ) : null}

              {responseHeadersText ? (
                <JsonBlock
                  label="响应头 Response Headers"
                  value={responseHeadersText}
                  rows={4}
                  readOnly
                />
              ) : null}

              {responseBodyText ? (
                <JsonBlock
                  label="响应体 Response Body"
                  value={responseBodyText}
                  rows={12}
                  readOnly
                />
              ) : null}
            </div>
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
          {item ? (
            <button
              type="button"
              disabled={testing || loadingPreview}
              onClick={onRun}
              className="rounded-lg bg-brand/20 px-4 py-2 text-sm font-medium text-brand-soft transition hover:bg-brand/30 disabled:opacity-40"
            >
              {testing ? "发送中…" : "Send 发送"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DfcApisManagement() {
  const [endpoints, setEndpoints] = useState<DfcApiItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appCode, setAppCode] = useState("all");
  const [apps, setApps] = useState<DfcApiAppSummary[]>([]);
  const [registryApps, setRegistryApps] = useState<DfcAppRegistryOption[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [total, setTotal] = useState(0);
  const [catalogSize, setCatalogSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testingItem, setTestingItem] = useState<DfcApiItem | null>(null);
  const [paramsText, setParamsText] = useState("{}");
  const [headersText, setHeadersText] = useState("{}");
  const [queryText, setQueryText] = useState("{}");
  const [bodyText, setBodyText] = useState("{}");
  const [cookiesText, setCookiesText] = useState("{}");
  const [testPreview, setTestPreview] = useState<DfcApiTestRequestPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [testActiveTab, setTestActiveTab] = useState<TestPanelTab>("params");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DfcApiTestResult | null>(null);
  const [batchTestResults, setBatchTestResults] = useState<DfcApiTestResult[] | null>(
    null,
  );
  const [batchTestItems, setBatchTestItems] = useState<BatchTestItemState[] | null>(
    null,
  );
  const [testError, setTestError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formActiveTab, setFormActiveTab] = useState<FormPanelTab>("endpoint");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ApiDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const pageIds = useMemo(() => endpoints.map((item) => item.id), [endpoints]);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const appFilterOptions = useMemo(
    () => [
      {
        value: "all",
        label: "全部服务",
        badge: String(catalogSize || apps.reduce((sum, app) => sum + app.total, 0)),
      },
      ...apps.map((app) => ({
        value: app.appCode,
        label: app.appCode,
        badge: String(app.total),
      })),
    ],
    [apps, catalogSize],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        kind: "http",
      });
      if (appCode !== "all") {
        params.set("appCode", appCode);
      }
      if (query.trim()) {
        params.set("q", query.trim());
      }
      const response = await fetch(`/api/dfc-apis?${params.toString()}`);
      if (!response.ok) {
        setError("加载接口目录失败");
        return;
      }
      const data = (await response.json()) as {
        endpoints?: DfcApiItem[];
        apps?: DfcApiAppSummary[];
        registryApps?: DfcAppRegistryOption[];
        total?: number;
        catalogSize?: number;
        canManage?: boolean;
        storage?: "mysql" | "json";
        page?: number;
      };
      setEndpoints(data.endpoints ?? []);
      setApps(data.apps ?? []);
      setRegistryApps(data.registryApps ?? []);
      setTotal(data.total ?? 0);
      setCatalogSize(data.catalogSize ?? 0);
      setCanManage(Boolean(data.canManage));
      if (data.page && data.page !== page) {
        setPage(data.page);
      }
    } finally {
      setLoading(false);
    }
  }, [appCode, page, pageSize, query]);

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

  function buildPayloadFromDraft(draft: ApiDraft) {
    const meta = deriveDraftMeta(draft);
    const defaultTestConfig = buildTestConfigFromDraft(draft);
    const registryApp =
      registryApps.find((item) => item.appCode === meta.appCode) ??
      buildServiceSelectOptions(registryApps, apps, meta.appCode).find(
        (item) => item.appCode === meta.appCode,
      );
    const endpoint = {
      id: meta.id,
      appCode: meta.appCode,
      repo: registryApp?.repo ?? meta.appCode,
      title: meta.title,
      description: draft.description.trim(),
      kind: "http" as const,
      readOnly: draft.readOnly,
      baseUrlEnvKey:
        registryApp?.baseUrlEnvKey ??
        (draft.baseUrlEnvKey.trim() || "DFC_API_GATEWAY_BASE_URL"),
      methodName: meta.methodName,
      http: {
        method: draft.httpMethod,
        path: draft.httpPath.trim(),
      },
    };
    return { endpoint, defaultTestConfig, enabled: draft.enabled };
  }

  function openCreateModal() {
    setCreating(true);
    setDraft(emptyDraft(registryApps));
    setFormActiveTab("endpoint");
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(item: DfcApiItem) {
    setCreating(false);
    setDraft(draftFromItem(item));
    setFormActiveTab("params");
    setFormError(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    if (saving) {
      return;
    }
    setFormOpen(false);
    setDraft(emptyDraft());
    setFormError(null);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = buildPayloadFromDraft(draft);
      const response = await fetch("/api/dfc-apis", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          creating
            ? payload
            : {
                id: draft.id,
                description: payload.endpoint.description,
                readOnly: payload.endpoint.readOnly,
                enabled: payload.enabled,
                defaultTestConfig: payload.defaultTestConfig,
                endpoint: payload.endpoint,
              },
        ),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFormError(body.error ?? "保存失败");
        return;
      }
      closeFormModal();
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: DfcApiItem) {
    if (!canManage || item.seeded) {
      return;
    }
    if (!window.confirm(`确认删除自定义接口「${formatEndpointLine(item)}」？`)) {
      return;
    }
    await fetch(`/api/dfc-apis?id=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  function toggleSelectAllPage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        for (const id of pageIds) {
          next.delete(id);
        }
      } else {
        for (const id of pageIds) {
          next.add(id);
        }
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function loadTestPreview(item: DfcApiItem, params?: Record<string, unknown>) {
    setLoadingPreview(true);
    try {
      const search = new URLSearchParams({ endpointId: item.id });
      if (params && Object.keys(params).length) {
        search.set("params", JSON.stringify(params));
      }
      const response = await fetch(`/api/dfc-apis/test?${search.toString()}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as {
        preview?: DfcApiTestRequestPreview;
        error?: string;
      };
      if (!response.ok) {
        setTestPreview(null);
        setTestError(payload.error ?? "加载请求预览失败");
        return;
      }
      setTestPreview(payload.preview ?? null);
      if (payload.preview) {
        const fillIfEmpty = (
          current: string,
          value: unknown,
          fallback = "{}",
        ) => {
          if (current.trim() !== "{}" && current.trim()) {
            return current;
          }
          return prettyJson(value) || fallback;
        };
        if (payload.preview.headers) {
          setHeadersText((current) =>
            fillIfEmpty(current, payload.preview?.headers),
          );
        }
        if (payload.preview.cookies) {
          setCookiesText((current) =>
            fillIfEmpty(current, payload.preview?.cookies),
          );
        }
        if (payload.preview.query) {
          setQueryText((current) =>
            fillIfEmpty(current, payload.preview?.query),
          );
        }
        if (payload.preview.body != null) {
          setBodyText((current) =>
            fillIfEmpty(current, payload.preview?.body, ""),
          );
        }
      }
    } catch (error) {
      setTestPreview(null);
      setTestError(error instanceof Error ? error.message : "加载请求预览失败");
    } finally {
      setLoadingPreview(false);
    }
  }

  function applyTestConfigToForm(config: NonNullable<DfcApiItem["defaultTestConfig"]>) {
    setParamsText(prettyJson(config.params) || "{}");
    setHeadersText(prettyJson(config.headers) || "{}");
    setQueryText(prettyJson(config.query) || "{}");
    setBodyText(prettyJson(config.body) || "{}");
    setCookiesText(prettyJson(config.cookies) || "{}");
  }

  function openTestModal(item: DfcApiItem) {
    const config = item.defaultTestConfig ?? {
      params: item.defaultTestParams ?? {},
      headers: {},
      query: {},
      cookies: {},
    };
    setTestingItem(item);
    applyTestConfigToForm(config);
    setTestPreview(null);
    setTestActiveTab("params");
    setTestResult(null);
    setBatchTestResults(null);
    setBatchTestItems(null);
    setTestError(null);
    setTestModalOpen(true);
    void loadTestPreview(item, config.params as Record<string, unknown>);
  }

  function closeTestModal() {
    if (testing) {
      return;
    }
    setTestModalOpen(false);
    setTestingItem(null);
    setTestPreview(null);
    setTestResult(null);
    setBatchTestResults(null);
    setBatchTestItems(null);
    setTestError(null);
  }

  function resolveBatchItemMeta(endpointId: string) {
    const item = endpoints.find((entry) => entry.id === endpointId);
    return {
      title: item?.title ?? endpointId,
      line: item ? formatEndpointLine(item) : endpointId,
    };
  }

  function markBatchTesting(endpointId: string) {
    setBatchTestItems((current) =>
      current?.map((entry) =>
        entry.endpointId === endpointId
          ? { ...entry, status: "testing" }
          : entry,
      ) ?? null,
    );
  }

  function markBatchDone(result: DfcApiTestResult) {
    setBatchTestItems((current) =>
      current?.map((entry) =>
        entry.endpointId === result.endpointId
          ? {
              ...entry,
              status: "done",
              title: result.title || entry.title,
              result,
            }
          : entry,
      ) ?? null,
    );
    setBatchTestResults((current) => [...(current ?? []), result]);
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
          const endpointId = (event.payload as { endpointId?: string }).endpointId;
          if (endpointId) {
            markBatchTesting(endpointId);
          }
        } else if (event.event === "result") {
          const result = (event.payload as { result?: DfcApiTestResult }).result;
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
    if (!testingItem) {
      return;
    }

    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const params = parseJsonObject(paramsText, "测试入参");
      const headers = parseJsonStringMap(headersText, "请求头");
      const query = parseJsonStringMap(queryText, "Query 参数");
      const cookies = parseJsonStringMap(cookiesText, "Cookies");
      const bodyRaw = bodyText.trim();
      const body = bodyRaw ? parseJsonObject(bodyText, "Body") : undefined;
      const response = await fetch("/api/dfc-apis/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointId: testingItem.id,
          params,
          headers,
          query,
          body,
          cookies,
        }),
      });
      const payload = (await response.json()) as {
        result?: DfcApiTestResult;
        error?: string;
      };
      if (!response.ok) {
        setTestError(payload.error ?? "测试失败");
        return;
      }
      setTestResult(payload.result ?? null);
      if (payload.result?.request) {
        setTestPreview(payload.result.request);
      }
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "测试失败");
    } finally {
      setTesting(false);
    }
  }

  async function runBatchTest() {
    const endpointIds = [...selectedIds];
    if (!endpointIds.length) {
      return;
    }

    setTesting(true);
    setTestError(null);
    setTestResult(null);
    setBatchTestResults([]);
    setBatchTestItems(
      endpointIds.map((endpointId) => ({
        endpointId,
        ...resolveBatchItemMeta(endpointId),
        status: "pending" as const,
      })),
    );
    setTestingItem(null);
    setTestModalOpen(true);

    try {
      const response = await fetch("/api/dfc-apis/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointIds, stream: true }),
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 shrink-0">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-brand-soft"
        >
          <BackChevronIcon />
          返回工具管理
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">大风车接口目录</h1>
        <p className="mt-1 text-sm text-muted">
          在此新增、维护大风车 HTTP 接口。Agent 经 route_api / search_api / call_backend_api 调用目录中的接口。工具启停与说明请到
          {" "}
          <Link href="/tools" className="text-brand-soft transition hover:text-brand">
            工具管理
          </Link>
          。目录存于 MySQL；同步：<code className="text-xs">pnpm db:sync-apis</code>。
        </p>
      </div>

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-stretch overflow-hidden rounded-xl border border-border bg-surface focus-within:border-brand/30">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="按路径、方法搜索"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-foreground outline-none"
          />
        </div>

        <DarkSelect
          value={appCode}
          options={appFilterOptions}
          searchable
          searchPlaceholder="搜索后端服务…"
          placeholder="全部服务"
          className="w-56 shrink-0"
          onChange={(value) => {
            setAppCode(value);
            setPage(1);
          }}
        />

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition hover:border-border-strong"
        >
          刷新
        </button>

        {canManage && selectedIds.size > 0 ? (
          <button
            type="button"
            disabled={testing}
            onClick={() => void runBatchTest()}
            className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm text-brand-soft transition hover:bg-brand/20 disabled:opacity-40"
          >
            {testing ? "测试中…" : `批量测试 (${selectedIds.size})`}
          </button>
        ) : null}

        {canManage ? (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            <span aria-hidden>+</span>
            新增接口
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-3 text-sm text-amber-400">{error}</p> : null}

      <div className="ui-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {loading ? (
            <p className="px-5 py-12 text-center text-sm text-muted">加载中…</p>
          ) : endpoints.length ? (
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
              {endpoints.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 transition hover:bg-surface-hover"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {canManage ? (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        aria-label={`选择 ${formatEndpointLine(item)}`}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm text-foreground">
                          {formatEndpointLine(item)}
                        </p>
                        <span
                          className="rounded-full border border-indigo-400/25 bg-indigo-400/10 px-2 py-0.5 font-mono text-[10px] text-indigo-200"
                          title="所属后端服务"
                        >
                          {item.appCode}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            item.kind === "http"
                              ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
                              : "border-amber-400/20 bg-amber-400/10 text-amber-300"
                          }`}
                        >
                          {formatKind(item.kind)}
                        </span>
                        {!item.readOnly ? (
                          <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-0.5 text-[10px] text-rose-300">
                            非只读
                          </span>
                        ) : null}
                        {!item.enabled ? (
                          <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] text-muted">
                            停用
                          </span>
                        ) : null}
                        {!item.seeded ? (
                          <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[10px] text-violet-300">
                            自定义
                          </span>
                        ) : null}
                        <span
                          className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] text-muted"
                          title="Agent call_backend_api 累计调用次数"
                        >
                          调用 {item.agentCallCount ?? 0}
                        </span>
                      </div>
                      {item.description ? (
                        <p className="mt-1 line-clamp-1 text-xs text-muted">{item.description}</p>
                      ) : null}
                    </div>
                  </div>

                  {canManage ? (
                    <div className="flex shrink-0 flex-col items-end gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => openTestModal(item)}
                        className="text-brand-soft transition hover:text-brand"
                      >
                        测试
                      </button>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="text-muted transition hover:text-foreground"
                        >
                          编辑
                        </button>
                        {!item.seeded ? (
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
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-muted">暂无匹配接口</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          第 {rangeStart}-{rangeEnd} 条，匹配 {total} / 全库 {catalogSize}
          {selectedIds.size > 0 ? ` · 已选 ${selectedIds.size} 项` : ""}
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

      <ApiFormModal
        open={formOpen}
        title={creating ? "新增接口" : "编辑接口"}
        draft={draft}
        creating={creating}
        saving={saving}
        error={formError}
        activeTab={formActiveTab}
        registryApps={registryApps}
        catalogApps={apps}
        onChangeTab={setFormActiveTab}
        onChange={setDraft}
        onClose={closeFormModal}
        onSave={() => void handleSave()}
      />

      <ApiTestModal
        open={testModalOpen}
        item={testingItem}
        testing={testing}
        loadingPreview={loadingPreview}
        activeTab={testActiveTab}
        paramsText={paramsText}
        headersText={headersText}
        queryText={queryText}
        bodyText={bodyText}
        cookiesText={cookiesText}
        preview={testPreview}
        result={testResult}
        batchResults={batchTestResults}
        batchItems={batchTestItems}
        error={testError}
        onChangeTab={setTestActiveTab}
        onChangeParams={setParamsText}
        onChangeHeaders={setHeadersText}
        onChangeQuery={setQueryText}
        onChangeBody={setBodyText}
        onChangeCookies={setCookiesText}
        onClose={closeTestModal}
        onRun={() => void runSingleTest()}
      />
    </div>
  );
}

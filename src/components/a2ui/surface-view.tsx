"use client";

import { useState } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { A2UIComponent, A2UISurface } from "@/lib/a2ui/types";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { cn } from "@/lib/utils";

const PIE_COLORS = ["#a1a1aa", "#71717a", "#d4d4d8", "#52525b", "#e4e4e7", "#3f3f46"];

function ChartView({ chart }: { chart: Extract<A2UIComponent, { type: "Chart" }>["chart"] }) {
  const data = chart.data.map((row) => ({
    ...row,
    [chart.xKey]: String(row[chart.xKey] ?? ""),
    [chart.yKey]: Number(row[chart.yKey] ?? 0),
  }));

  if (chart.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey={chart.yKey}
            nameKey={chart.xKey}
            outerRadius={84}
            label
          >
            {data.map((_, index) => (
              <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
          <XAxis dataKey={chart.xKey} stroke="#71717a" fontSize={11} />
          <YAxis stroke="#71717a" fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey={chart.yKey} stroke="#e4e4e7" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
        <XAxis dataKey={chart.xKey} stroke="#71717a" fontSize={11} />
        <YAxis stroke="#71717a" fontSize={11} />
        <Tooltip />
        <Bar dataKey={chart.yKey} fill="#a1a1aa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TableView({
  component,
}: {
  component: Extract<A2UIComponent, { type: "Table" }>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            downloadCsv(
              `query-result-${Date.now()}.csv`,
              buildCsv(component.columns, component.rows),
            )
          }
          className="rounded-md border border-white/[0.08] px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-white/15 hover:text-zinc-200"
        >
          导出 CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-white/[0.03] text-zinc-500">
            <tr>
              {component.columns.map((column) => (
                <th key={column} className="px-3 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {component.rows.slice(0, 100).map((row, index) => (
              <tr key={index} className="border-t border-white/[0.05] text-zinc-300">
                {component.columns.map((column) => (
                  <td key={column} className="px-3 py-2 font-mono text-[11px]">
                    {row[column] === null || row[column] === undefined
                      ? "—"
                      : String(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComponentView({
  component,
  onAction,
  disabled,
  editableSql,
  onEditableSqlChange,
  variant,
}: {
  component: A2UIComponent;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
  disabled?: boolean;
  editableSql?: string;
  onEditableSqlChange?: (sql: string) => void;
  variant: "approval" | "result";
}) {
  switch (component.type) {
    case "Text":
      return (
        <p
          className={cn(
            "text-[12px] leading-5 whitespace-pre-wrap",
            component.id.includes("error")
              ? "text-rose-300"
              : component.id.includes("hints")
                ? "text-zinc-500"
                : "text-zinc-300",
          )}
        >
          {component.text}
        </p>
      );
    case "Code":
      if (component.editable) {
        return (
          <div className="overflow-hidden rounded-lg border border-white/[0.1] bg-[#0c0c0e]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                sql
              </span>
              <span className="text-[10px] text-zinc-600">可编辑</span>
            </div>
            <textarea
              value={editableSql ?? component.code}
              onChange={(event) => onEditableSqlChange?.(event.target.value)}
              rows={Math.min(
                12,
                Math.max(4, (editableSql ?? component.code).split("\n").length + 1),
              )}
              className="w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12px] leading-6 text-zinc-200 outline-none"
              spellCheck={false}
            />
          </div>
        );
      }

      return (
        <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0c0e]">
          <div className="border-b border-white/[0.06] px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              sql
            </span>
          </div>
          <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-6 text-zinc-300">
            {component.code}
          </pre>
        </div>
      );
    case "Table":
      return <TableView component={component} />;
    case "Chart":
      return (
        <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
          {component.chart.title ? (
            <p className="mb-2 text-[12px] font-medium text-zinc-400">
              {component.chart.title}
            </p>
          ) : null}
          <ChartView chart={component.chart} />
        </div>
      );
    case "ButtonGroup":
      return (
        <div
          className={cn(
            "flex flex-wrap gap-2",
            variant === "approval" && "justify-end border-t border-white/[0.06] pt-3",
          )}
        >
          {component.buttons.map((button) => {
            const isPrimary = button.action === "confirm_sql";
            return (
              <button
                key={button.id}
                type="button"
                disabled={disabled}
                onClick={() => onAction?.(button.action, button.payload)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                  isPrimary
                    ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                    : "border border-white/[0.1] text-zinc-300 hover:bg-white/[0.04]",
                )}
              >
                {button.label}
              </button>
            );
          })}
        </div>
      );
    default:
      return null;
  }
}

export function A2UISurfaceView({
  surface,
  onAction,
  disabled,
  variant = "result",
}: {
  surface: A2UISurface;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
  disabled?: boolean;
  variant?: "approval" | "result";
}) {
  const editableCode = surface.components.find(
    (component) => component.type === "Code" && component.editable,
  );
  const codeFromSurface =
    editableCode?.type === "Code" ? editableCode.code : "";
  const [editableSql, setEditableSql] = useState(codeFromSurface);
  const [syncedCode, setSyncedCode] = useState(codeFromSurface);

  if (codeFromSurface !== syncedCode) {
    setSyncedCode(codeFromSurface);
    setEditableSql(codeFromSurface);
  }

  const handleAction = (action: string, payload?: Record<string, unknown>) => {
    if (action === "confirm_sql") {
      onAction?.(action, {
        ...payload,
        sql: editableSql.trim() || undefined,
      });
      return;
    }

    onAction?.(action, payload);
  };

  const isApproval = variant === "approval";
  const textAndCode = surface.components.filter(
    (component) => component.type !== "ButtonGroup",
  );
  const actions = surface.components.filter(
    (component) => component.type === "ButtonGroup",
  );

  return (
    <section
      className={cn(
        "space-y-3 rounded-xl border p-3.5",
        isApproval
          ? "border-amber-400/20 bg-amber-400/[0.04]"
          : "border-white/[0.08] bg-white/[0.02]",
      )}
    >
      {surface.title ? (
        <div className="flex items-center gap-2">
          {isApproval ? (
            <span className="text-[11px] text-amber-400" aria-hidden>
              ⚠
            </span>
          ) : null}
          <h3
            className={cn(
              "text-[12px] font-medium",
              isApproval ? "text-amber-100/90" : "text-zinc-300",
            )}
          >
            {surface.title}
          </h3>
        </div>
      ) : null}

      {textAndCode.map((component) => (
        <ComponentView
          key={component.id}
          component={component}
          onAction={handleAction}
          disabled={disabled}
          editableSql={editableSql}
          onEditableSqlChange={setEditableSql}
          variant={variant}
        />
      ))}

      {actions.map((component) => (
        <ComponentView
          key={component.id}
          component={component}
          onAction={handleAction}
          disabled={disabled}
          editableSql={editableSql}
          onEditableSqlChange={setEditableSql}
          variant={variant}
        />
      ))}
    </section>
  );
}

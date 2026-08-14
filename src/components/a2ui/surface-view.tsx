"use client";

import { useState } from "react";

import type { A2UIComponent, A2UISurface } from "@/lib/a2ui/types";
import { ChartCard } from "@/components/a2ui/chart-view";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { cn } from "@/lib/utils";

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
          className="ui-btn-secondary px-2.5 py-1 text-[11px]"
        >
          导出 CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-surface text-muted">
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
              <tr key={index} className="border-t border-border text-foreground">
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
                ? "text-muted"
                : "text-foreground",
          )}
        >
          {component.text}
        </p>
      );
    case "Code":
      if (component.editable) {
        return (
          <div className="overflow-hidden rounded-lg border border-border bg-code">
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                sql
              </span>
              <span className="text-[10px] text-muted-foreground">可编辑</span>
            </div>
            <textarea
              value={editableSql ?? component.code}
              onChange={(event) => onEditableSqlChange?.(event.target.value)}
              rows={Math.min(
                12,
                Math.max(4, (editableSql ?? component.code).split("\n").length + 1),
              )}
              className="w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12px] leading-6 text-foreground outline-none"
              spellCheck={false}
            />
          </div>
        );
      }

      return (
        <div className="overflow-hidden rounded-lg border border-border bg-code">
          <div className="border-b border-border px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              sql
            </span>
          </div>
          <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-6 text-foreground">
            {component.code}
          </pre>
        </div>
      );
    case "Table":
      return <TableView component={component} />;
    case "Chart":
      return <ChartCard chart={component.chart} />;
    case "ButtonGroup":
      return (
        <div
          className={cn(
            "flex flex-wrap gap-2",
            variant === "approval" && "justify-end border-t border-border pt-3",
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
                    ? "bg-brand text-white hover:bg-brand-hover"
                    : "border border-border text-foreground hover:border-brand/25 hover:bg-brand/5 hover:text-brand-soft",
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
          ? "ui-panel-approval"
          : "ui-panel",
      )}
    >
      {surface.title ? (
        <div className="flex items-center gap-2">
          {isApproval ? (
            <span className="text-[11px] text-brand" aria-hidden>
              ⚠
            </span>
          ) : null}
          <h3
            className={cn(
              "text-[12px] font-medium",
              isApproval ? "text-brand-soft" : "text-foreground",
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

"use client";

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
import { cn } from "@/lib/utils";

const PIE_COLORS = ["#22d3ee", "#34d399", "#a78bfa", "#fbbf24", "#f472b6", "#60a5fa"];

function ChartView({ chart }: { chart: Extract<A2UIComponent, { type: "Chart" }>["chart"] }) {
  const data = chart.data.map((row) => ({
    ...row,
    [chart.xKey]: String(row[chart.xKey] ?? ""),
    [chart.yKey]: Number(row[chart.yKey] ?? 0),
  }));

  if (chart.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey={chart.yKey}
            nameKey={chart.xKey}
            outerRadius={90}
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
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff22" />
          <XAxis dataKey={chart.xKey} stroke="#94a3b8" fontSize={11} />
          <YAxis stroke="#94a3b8" fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey={chart.yKey} stroke="#22d3ee" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff22" />
        <XAxis dataKey={chart.xKey} stroke="#94a3b8" fontSize={11} />
        <YAxis stroke="#94a3b8" fontSize={11} />
        <Tooltip />
        <Bar dataKey={chart.yKey} fill="#22d3ee" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ComponentView({
  component,
  onAction,
  disabled,
}: {
  component: A2UIComponent;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  switch (component.type) {
    case "Text":
      return <p className="text-sm leading-6 text-slate-200 whitespace-pre-wrap">{component.text}</p>;
    case "Code":
      return (
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs leading-6 text-cyan-100">
          {component.code}
        </pre>
      );
    case "Table":
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-white/5 text-slate-400">
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
                <tr key={index} className="border-t border-white/5 text-slate-200">
                  {component.columns.map((column) => (
                    <td key={column} className="px-3 py-2 font-mono">
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
      );
    case "Chart":
      return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          {component.chart.title ? (
            <p className="mb-2 text-xs font-medium text-slate-300">{component.chart.title}</p>
          ) : null}
          <ChartView chart={component.chart} />
        </div>
      );
    case "ButtonGroup":
      return (
        <div className="flex flex-wrap gap-2">
          {component.buttons.map((button) => (
            <button
              key={button.id}
              type="button"
              disabled={disabled}
              onClick={() => onAction?.(button.action, button.payload)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                button.action === "confirm_sql"
                  ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                  : "border border-white/15 text-slate-200 hover:border-white/30",
              )}
            >
              {button.label}
            </button>
          ))}
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
}: {
  surface: A2UISurface;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4">
      {surface.title ? (
        <h3 className="text-sm font-semibold text-cyan-100">{surface.title}</h3>
      ) : null}
      {surface.components.map((component) => (
        <ComponentView
          key={component.id}
          component={component}
          onAction={onAction}
          disabled={disabled}
        />
      ))}
    </section>
  );
}

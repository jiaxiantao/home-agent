import { z } from "zod";

import type { ChartSpec } from "@/lib/analytics/chart-spec";

export const a2uiComponentSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("Text"),
    text: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("Code"),
    language: z.string().default("sql"),
    code: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("Table"),
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.unknown())),
  }),
  z.object({
    id: z.string(),
    type: z.literal("Chart"),
    chart: z.object({
      type: z.enum(["bar", "line", "pie"]),
      title: z.string().optional(),
      xKey: z.string(),
      yKey: z.string(),
      data: z.array(z.record(z.string(), z.unknown())),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal("ButtonGroup"),
    buttons: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        action: z.string(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    ),
  }),
]);

export type A2UIComponent = z.infer<typeof a2uiComponentSchema>;

export type A2UISurface = {
  surfaceId: string;
  title?: string;
  components: A2UIComponent[];
};

export function buildSqlConfirmSurface(input: {
  surfaceId: string;
  runId: string;
  sql: string;
  explanation: string;
}): A2UISurface {
  return {
    surfaceId: input.surfaceId,
    title: "确认执行 SQL",
    components: [
      {
        id: `${input.surfaceId}-text`,
        type: "Text",
        text: input.explanation || "请确认是否执行以下只读查询：",
      },
      {
        id: `${input.surfaceId}-code`,
        type: "Code",
        language: "sql",
        code: input.sql,
      },
      {
        id: `${input.surfaceId}-actions`,
        type: "ButtonGroup",
        buttons: [
          {
            id: "confirm",
            label: "确认执行",
            action: "confirm_sql",
            payload: { runId: input.runId },
          },
          {
            id: "cancel",
            label: "取消",
            action: "cancel_sql",
            payload: { runId: input.runId },
          },
        ],
      },
    ],
  };
}

export function buildQueryResultSurface(input: {
  surfaceId: string;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  chart?: ChartSpec | null;
  summary?: string;
}): A2UISurface {
  const components: A2UIComponent[] = [];

  if (input.summary) {
    components.push({
      id: `${input.surfaceId}-summary`,
      type: "Text",
      text: input.summary,
    });
  }

  components.push({
    id: `${input.surfaceId}-sql`,
    type: "Code",
    language: "sql",
    code: input.sql,
  });

  components.push({
    id: `${input.surfaceId}-table`,
    type: "Table",
    columns: input.columns,
    rows: input.rows,
  });

  if (input.chart) {
    components.push({
      id: `${input.surfaceId}-chart`,
      type: "Chart",
      chart: input.chart,
    });
  }

  return {
    surfaceId: input.surfaceId,
    title: "查询结果",
    components,
  };
}

import { executeAppMysql, queryAppMysql } from "@/lib/app-mysql/client";
import type { RowDataPacket } from "mysql2/promise";
import type { A2UISurface } from "@/lib/a2ui/types";
import type { ChartSpec } from "@/lib/analytics/chart-spec";

export type DashboardCard = {
  id: string;
  userId: string;
  title: string;
  question: string;
  sql?: string;
  surface?: A2UISurface;
  chart?: ChartSpec;
  sortOrder: number;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
};

type DashboardRow = RowDataPacket & {
  id: string;
  user_id: string;
  title: string;
  question: string;
  sql_text: string | null;
  surface_json: string | A2UISurface | null;
  chart_json: string | ChartSpec | null;
  sort_order: number;
  shared: number;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string | T | null): T | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value;
}

function rowToCard(row: DashboardRow): DashboardCard {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    question: row.question,
    sql: row.sql_text ?? undefined,
    surface: parseJson<A2UISurface>(row.surface_json),
    chart: parseJson<ChartSpec>(row.chart_json),
    sortOrder: row.sort_order,
    shared: row.shared === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDashboardCards(userId: string): Promise<DashboardCard[]> {
  const rows = await queryAppMysql<DashboardRow>(
    `SELECT * FROM dashboard_cards WHERE user_id = ? OR shared = 1 ORDER BY sort_order ASC, created_at DESC`,
    [userId],
  );
  return rows.map(rowToCard);
}

export type PinCardInput = {
  userId: string;
  title: string;
  question: string;
  sql?: string;
  surface?: A2UISurface;
  chart?: ChartSpec;
  shared?: boolean;
};

export async function pinDashboardCard(input: PinCardInput): Promise<string> {
  const id = `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await executeAppMysql(
    `INSERT INTO dashboard_cards (id, user_id, title, question, sql_text, surface_json, chart_json, shared)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.title,
      input.question,
      input.sql ?? null,
      input.surface ? JSON.stringify(input.surface) : null,
      input.chart ? JSON.stringify(input.chart) : null,
      input.shared ? 1 : 0,
    ],
  );
  return id;
}

export async function unpinDashboardCard(id: string, userId: string) {
  await executeAppMysql(
    `DELETE FROM dashboard_cards WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
}

export async function updateDashboardCard(
  id: string,
  userId: string,
  patch: { title?: string; sortOrder?: number; shared?: boolean },
) {
  const sets: string[] = [];
  const params: Array<string | number> = [];

  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(patch.title);
  }
  if (patch.sortOrder !== undefined) {
    sets.push("sort_order = ?");
    params.push(patch.sortOrder);
  }
  if (patch.shared !== undefined) {
    sets.push("shared = ?");
    params.push(patch.shared ? 1 : 0);
  }

  if (!sets.length) return;

  params.push(id, userId);
  await executeAppMysql(
    `UPDATE dashboard_cards SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
    params,
  );
}

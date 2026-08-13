import type { TeamTemplate } from "@/lib/history/team-templates";
import { createTeamTemplateId } from "@/lib/history/team-template-id";
import {
  isMyFavoritesCategory,
  MY_FAVORITES_CATEGORY,
} from "@/lib/history/team-template-constants";
import { executeAppMysql, queryAppMysql } from "@/lib/app-mysql/client";
import type { RowDataPacket } from "mysql2/promise";

type TeamTemplateRow = RowDataPacket & {
  id: string;
  label: string;
  prompt: string;
  category: string;
  created_by: string;
  created_at: Date;
  sort_order: number;
};

function mapRow(row: TeamTemplateRow): TeamTemplate {
  return {
    id: row.id,
    label: row.label,
    prompt: row.prompt,
    category: row.category,
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: row.created_by,
  };
}

export async function listMysqlTeamTemplates() {
  const rows = await queryAppMysql<TeamTemplateRow>(
    `SELECT id, label, prompt, category, created_by, created_at, sort_order
     FROM team_templates
     ORDER BY category ASC, sort_order ASC, created_at DESC`,
  );
  return rows.map(mapRow);
}

export async function createMysqlTeamTemplate(input: {
  id?: string;
  label: string;
  prompt: string;
  createdBy: string;
  category?: string;
}) {
  const label = input.label.trim().slice(0, 40);
  const prompt = input.prompt.trim().slice(0, 2000);
  const category = (input.category ?? "自定义").trim().slice(0, 40) || "自定义";

  if (isMyFavoritesCategory(category)) {
    const existingFavorite = await queryAppMysql<TeamTemplateRow>(
      `SELECT id, label, prompt, category, created_by, created_at, sort_order
       FROM team_templates
       WHERE created_by = ? AND category = ? AND prompt = ?
       LIMIT 1`,
      [input.createdBy, MY_FAVORITES_CATEGORY, prompt],
    );
    if (existingFavorite[0]) {
      return mapRow(existingFavorite[0]);
    }
  } else {
    const existing = await queryAppMysql<TeamTemplateRow>(
      `SELECT id, label, prompt, category, created_by, created_at, sort_order
       FROM team_templates
       WHERE prompt = ? AND category <> ?
       LIMIT 1`,
      [prompt, MY_FAVORITES_CATEGORY],
    );
    if (existing[0]) {
      return mapRow(existing[0]);
    }
  }

  const id = input.id ?? createTeamTemplateId();
  await executeAppMysql(
    `INSERT INTO team_templates (id, label, prompt, category, created_by, sort_order)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [id, label, prompt, category, input.createdBy],
  );

  const created = await queryAppMysql<TeamTemplateRow>(
    `SELECT id, label, prompt, category, created_by, created_at, sort_order
     FROM team_templates WHERE id = ? LIMIT 1`,
    [id],
  );
  return mapRow(created[0]!);
}

export async function deleteMysqlTeamTemplate(id: string) {
  const result = await executeAppMysql(
    `DELETE FROM team_templates WHERE id = ?`,
    [id],
  );
  return result.affectedRows > 0;
}

export async function upsertMysqlTeamTemplate(
  id: string,
  input: {
    label?: string;
    prompt?: string;
    category?: string;
    createdBy?: string;
  },
) {
  const existing = await queryAppMysql<TeamTemplateRow>(
    `SELECT id, label, prompt, category, created_by, created_at, sort_order
     FROM team_templates WHERE id = ? LIMIT 1`,
    [id],
  );

  if (existing[0]) {
    const row = existing[0];
    const label = (input.label ?? row.label).trim().slice(0, 40);
    const prompt = (input.prompt ?? row.prompt).trim().slice(0, 2000);
    const category =
      (input.category ?? row.category).trim().slice(0, 40) || "自定义";

    if (!label || !prompt) {
      throw new Error("label 与 prompt 不能为空");
    }

    await executeAppMysql(
      `UPDATE team_templates SET label = ?, prompt = ?, category = ? WHERE id = ?`,
      [label, prompt, category, id],
    );
  } else {
    const label = input.label?.trim().slice(0, 40) ?? "";
    const prompt = input.prompt?.trim().slice(0, 2000) ?? "";
    const category = (input.category ?? "自定义").trim().slice(0, 40) || "自定义";

    if (!label || !prompt) {
      throw new Error("label 与 prompt 不能为空");
    }

    await executeAppMysql(
      `INSERT INTO team_templates (id, label, prompt, category, created_by, sort_order)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [id, label, prompt, category, input.createdBy ?? "override"],
    );
  }

  const updated = await queryAppMysql<TeamTemplateRow>(
    `SELECT id, label, prompt, category, created_by, created_at, sort_order
     FROM team_templates WHERE id = ? LIMIT 1`,
    [id],
  );
  return updated[0] ? mapRow(updated[0]) : null;
}

export async function updateMysqlTeamTemplate(
  id: string,
  input: {
    label?: string;
    prompt?: string;
    category?: string;
  },
) {
  const existing = await queryAppMysql<TeamTemplateRow>(
    `SELECT id, label, prompt, category, created_by, created_at, sort_order
     FROM team_templates WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!existing[0]) {
    return null;
  }

  const row = existing[0];
  const label = (input.label ?? row.label).trim().slice(0, 40);
  const prompt = (input.prompt ?? row.prompt).trim().slice(0, 2000);
  const category =
    (input.category ?? row.category).trim().slice(0, 40) || "自定义";

  if (!label || !prompt) {
    throw new Error("label 与 prompt 不能为空");
  }

  await executeAppMysql(
    `UPDATE team_templates SET label = ?, prompt = ?, category = ? WHERE id = ?`,
    [label, prompt, category, id],
  );

  const updated = await queryAppMysql<TeamTemplateRow>(
    `SELECT id, label, prompt, category, created_by, created_at, sort_order
     FROM team_templates WHERE id = ? LIMIT 1`,
    [id],
  );
  return mapRow(updated[0]!);
}

import type { TeamTemplateCategory } from "@/lib/history/team-template-categories";
import { executeAppMysql, queryAppMysql } from "@/lib/app-mysql/client";
import type { RowDataPacket } from "mysql2/promise";

type CategoryRow = RowDataPacket & {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: Date;
  template_count?: number;
};

function mapRow(row: CategoryRow): TeamTemplateCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at).toISOString(),
    templateCount: row.template_count ?? 0,
  };
}

export async function listMysqlTeamTemplateCategories() {
  const rows = await queryAppMysql<CategoryRow>(
    `SELECT c.id, c.name, c.description, c.sort_order, c.created_at,
            COUNT(t.id) AS template_count
     FROM team_template_categories c
     LEFT JOIN team_templates t ON t.category = c.name
     GROUP BY c.id, c.name, c.description, c.sort_order, c.created_at
     ORDER BY c.sort_order ASC, c.name ASC`,
  );
  return rows.map(mapRow);
}

export async function createMysqlTeamTemplateCategory(input: {
  name: string;
  description?: string;
  sortOrder?: number;
}) {
  const name = input.name.trim().slice(0, 40);
  const description = input.description?.trim().slice(0, 200) || null;
  const sortOrder = input.sortOrder ?? 0;

  const existing = await queryAppMysql<CategoryRow>(
    `SELECT id FROM team_template_categories WHERE name = ? LIMIT 1`,
    [name],
  );
  if (existing[0]) {
    throw new Error("分类名称已存在");
  }

  const id = `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await executeAppMysql(
    `INSERT INTO team_template_categories (id, name, description, sort_order)
     VALUES (?, ?, ?, ?)`,
    [id, name, description, sortOrder],
  );

  const created = await queryAppMysql<CategoryRow>(
    `SELECT id, name, description, sort_order, created_at
     FROM team_template_categories WHERE id = ? LIMIT 1`,
    [id],
  );
  return mapRow(created[0]!);
}

export async function updateMysqlTeamTemplateCategory(
  id: string,
  input: {
    name?: string;
    description?: string;
    sortOrder?: number;
  },
) {
  const existing = await queryAppMysql<CategoryRow>(
    `SELECT id, name, description, sort_order, created_at
     FROM team_template_categories WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!existing[0]) {
    return null;
  }

  const row = existing[0];
  const name = (input.name ?? row.name).trim().slice(0, 40);
  const description =
    input.description !== undefined
      ? input.description.trim().slice(0, 200) || null
      : row.description;
  const sortOrder = input.sortOrder ?? row.sort_order;

  if (!name) {
    throw new Error("分类名称不能为空");
  }

  if (name !== row.name) {
    const duplicate = await queryAppMysql<CategoryRow>(
      `SELECT id FROM team_template_categories WHERE name = ? AND id <> ? LIMIT 1`,
      [name, id],
    );
    if (duplicate[0]) {
      throw new Error("分类名称已存在");
    }

    await executeAppMysql(
      `UPDATE team_templates SET category = ? WHERE category = ?`,
      [name, row.name],
    );
  }

  await executeAppMysql(
    `UPDATE team_template_categories
     SET name = ?, description = ?, sort_order = ?
     WHERE id = ?`,
    [name, description, sortOrder, id],
  );

  const updated = await queryAppMysql<CategoryRow>(
    `SELECT id, name, description, sort_order, created_at
     FROM team_template_categories WHERE id = ? LIMIT 1`,
    [id],
  );
  return mapRow(updated[0]!);
}

export async function deleteMysqlTeamTemplateCategory(id: string) {
  const existing = await queryAppMysql<CategoryRow>(
    `SELECT id, name FROM team_template_categories WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!existing[0]) {
    return false;
  }

  const countRows = await queryAppMysql<RowDataPacket & { n: number }>(
    `SELECT COUNT(*) AS n FROM team_templates WHERE category = ?`,
    [existing[0].name],
  );
  const count = Number(countRows[0]?.n ?? 0);
  if (count > 0) {
    throw new Error(`该分类下还有 ${count} 条模板，无法删除`);
  }

  const result = await executeAppMysql(
    `DELETE FROM team_template_categories WHERE id = ?`,
    [id],
  );
  return result.affectedRows > 0;
}

export async function seedMysqlTeamTemplateCategories(names: string[]) {
  let inserted = 0;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!.trim().slice(0, 40);
    if (!name) {
      continue;
    }
    const id = `cat_seed_${String(index + 1).padStart(3, "0")}`;
    const result = await executeAppMysql(
      `INSERT IGNORE INTO team_template_categories (id, name, sort_order)
       VALUES (?, ?, ?)`,
      [id, name, index + 1],
    );
    if (result.affectedRows > 0) {
      inserted += 1;
    }
  }
  return inserted;
}

import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";

import { teamTemplateSeed, teamTemplateSeedCount, teamTemplateCategorySeed } from "../src/lib/history/team-template-catalog";
import { createTeamTemplateId, isRandomTeamTemplateId } from "../src/lib/history/team-template-id";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readConfig() {
  const host = process.env.APP_MYSQL_HOST?.trim();
  const user = process.env.APP_MYSQL_USER?.trim();
  if (!host || !user) {
    throw new Error(
      "请设置 APP_MYSQL_HOST / APP_MYSQL_USER，例如 APP_MYSQL_HOST=127.0.0.1 APP_MYSQL_USER=root APP_MYSQL_PASSWORD=123456 APP_MYSQL_DATABASE=dfc_data_agent",
    );
  }

  return {
    host,
    port: Number.parseInt(process.env.APP_MYSQL_PORT?.trim() || "3306", 10) || 3306,
    user,
    password: process.env.APP_MYSQL_PASSWORD ?? "",
    database: process.env.APP_MYSQL_DATABASE?.trim() || "dfc_data_agent",
  };
}

async function ensureDatabase() {
  const config = readConfig();
  const admin = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });

  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  console.log(`Database ready: ${config.database}`);
  await admin.end();
}

async function runMigration() {
  const config = readConfig();
  const migrationDir = join(__dirname, "mysql");
  const files = readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    multipleStatements: true,
  });

  for (const file of files) {
    const sql = readFileSync(join(migrationDir, file), "utf8");
    try {
      await conn.query(sql);
      console.log(`Migration applied: ${file}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Duplicate column|already exists|Duplicate key name/i.test(message)) {
        console.log(`Migration skipped (already applied): ${file}`);
        continue;
      }
      throw error;
    }
  }

  await conn.end();
}

async function migrateLegacyTemplateIds(
  conn: mysql.Connection,
) {
  const [rows] = await conn.query(
    `SELECT id FROM team_templates`,
  );
  const list = Array.isArray(rows) ? (rows as Array<{ id: string }>) : [];
  let migrated = 0;

  for (const row of list) {
    if (isRandomTeamTemplateId(row.id)) {
      continue;
    }

    let nextId = createTeamTemplateId();
    while (list.some((item) => item.id === nextId)) {
      nextId = createTeamTemplateId();
    }

    await conn.execute(`UPDATE team_templates SET id = ? WHERE id = ?`, [
      nextId,
      row.id,
    ]);
    await conn.execute(
      `UPDATE team_template_usage SET template_id = ? WHERE template_id = ?`,
      [nextId, row.id],
    );
    row.id = nextId;
    migrated += 1;
  }

  console.log(`Legacy template id migration: ${migrated} updated`);
}

async function seedTemplates() {
  const config = readConfig();
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  });

  await migrateLegacyTemplateIds(conn);

  let inserted = 0;
  let updated = 0;

  for (let index = 0; index < teamTemplateSeed.length; index += 1) {
    const item = teamTemplateSeed[index]!;
    const [existingRows] = await conn.execute(
      `SELECT id FROM team_templates WHERE created_by = 'seed' AND category = ? AND label = ? LIMIT 1`,
      [item.category, item.label],
    );
    const existing = Array.isArray(existingRows)
      ? (existingRows as Array<{ id: string }>)[0]
      : undefined;

    if (existing?.id) {
      await conn.execute(
        `UPDATE team_templates SET prompt = ?, sort_order = ? WHERE id = ?`,
        [item.prompt, index + 1, existing.id],
      );
      updated += 1;
      continue;
    }

    const id = createTeamTemplateId();
    const [result] = await conn.execute(
      `INSERT IGNORE INTO team_templates (id, label, prompt, category, created_by, sort_order)
       VALUES (?, ?, ?, ?, 'seed', ?)`,
      [id, item.label, item.prompt, item.category, index + 1],
    );
    if (((result as { affectedRows?: number }).affectedRows ?? 0) > 0) {
      inserted += 1;
    }
  }

  const catalogKeys = new Set(
    teamTemplateSeed.map((item) => `${item.category}\0${item.label}`),
  );
  const [seedRows] = await conn.query(
    `SELECT id, category, label FROM team_templates WHERE created_by = 'seed'`,
  );
  let pruned = 0;
  for (const row of Array.isArray(seedRows) ? (seedRows as Array<{ id: string; category: string; label: string }>) : []) {
    if (catalogKeys.has(`${row.category}\0${row.label}`)) {
      continue;
    }
    await conn.execute(`DELETE FROM team_template_usage WHERE template_id = ?`, [row.id]);
    await conn.execute(`DELETE FROM team_templates WHERE id = ?`, [row.id]);
    pruned += 1;
  }

  const [countRows] = await conn.query("SELECT COUNT(*) AS n FROM team_templates");
  const total = Array.isArray(countRows)
    ? Number((countRows[0] as { n: number }).n)
    : 0;
  await conn.end();

  console.log(
    `Seed complete: ${inserted} inserted, ${updated} updated, ${pruned} pruned (catalog has ${teamTemplateSeedCount})`,
  );
  console.log(`Total rows in team_templates: ${total}`);
}

async function seedCategories() {
  const config = readConfig();
  const names = teamTemplateCategorySeed();
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  });

  let inserted = 0;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!;
    const id = createTeamTemplateId();
    const [result] = await conn.execute(
      `INSERT IGNORE INTO team_template_categories (id, name, sort_order)
       VALUES (?, ?, ?)`,
      [id, name, index + 1],
    );
    if (((result as { affectedRows?: number }).affectedRows ?? 0) > 0) {
      inserted += 1;
    }
  }

  await conn.end();
  console.log(`Category seed complete: ${inserted} inserted (${names.length} in catalog)`);
}

async function main() {
  await ensureDatabase();
  await runMigration();
  await seedCategories();
  await seedTemplates();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

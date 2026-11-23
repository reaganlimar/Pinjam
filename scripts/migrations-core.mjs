// Shared migration logic used by scripts/db-migrate.mjs (Neon) and the tests (PGlite).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");

export function listMigrations(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") }));
}

/**
 * Applies pending migrations in order, each in its own transaction, and records them in
 * schema_migrations. Never drops or rewrites anything that is already applied.
 *
 * `db` needs: exec(sqlText) for multi-statement SQL, query(text, params) → { rows }.
 */
export async function applyMigrations(db, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query("SELECT name FROM schema_migrations");
  const done = new Set(rows.map((r) => r.name));
  const applied = [];
  for (const m of listMigrations(dir)) {
    if (done.has(m.name)) continue;
    log(`Applying ${m.name} …`);
    await db.exec("BEGIN");
    try {
      await db.exec(m.sql);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [m.name]);
      await db.exec("COMMIT");
    } catch (err) {
      await db.exec("ROLLBACK");
      throw new Error(`Migration ${m.name} failed and was rolled back: ${err.message}`, { cause: err });
    }
    applied.push(m.name);
  }
  return applied;
}

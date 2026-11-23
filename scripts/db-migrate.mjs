#!/usr/bin/env node
// Applies pending SQL migrations from db/migrations to the database in DATABASE_URL.
//
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- --status  list applied / pending, change nothing
//
// Uses DATABASE_URL_UNPOOLED when set (a direct connection is best for DDL), else DATABASE_URL.
// A Postgres advisory lock stops two deploys from migrating at the same time.
import pg from "pg";
import { applyMigrations, listMigrations } from "./migrations-core.mjs";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put your Neon connection string in .env.local (see .env.example).");
  process.exit(1);
}

const statusOnly = process.argv.includes("--status");
const client = new pg.Client({ connectionString: url });
const LOCK_ID = 7_413_002; // arbitrary constant for pg_advisory_lock

try {
  await client.connect();
  const host = new URL(url).hostname;
  console.log(`Connected to ${host}`);

  if (statusOnly) {
    const exists = await client.query("SELECT to_regclass('public.schema_migrations') AS t");
    const applied = exists.rows[0].t
      ? new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name))
      : new Set();
    for (const m of listMigrations()) console.log(`${applied.has(m.name) ? "applied " : "PENDING "} ${m.name}`);
  } else {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    try {
      const applied = await applyMigrations(
        { exec: (text) => client.query(text), query: (text, params) => client.query(text, params) },
        { log: (msg) => console.log(msg) },
      );
      console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Database is up to date.");
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

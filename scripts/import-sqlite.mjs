#!/usr/bin/env node
// Imports the old local SQLite data into the Postgres database in DATABASE_URL.
//
//   npm run db:import-sqlite              dry run: shows what would be copied
//   npm run db:import-sqlite -- --apply   copies it (only into an empty database)
//
// Options: --sqlite=./data/pinjam.db  --uploads=./data/uploads
// The SQLite file and uploads folder are only read, never modified or deleted.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { importFromSqlite } from "./import-sqlite-core.mjs";

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const sqlitePath = path.resolve(arg("sqlite", "./data/pinjam.db"));
const uploadDir = path.resolve(arg("uploads", "./data/uploads"));
const apply = process.argv.includes("--apply");

if (!fs.existsSync(sqlitePath)) {
  console.error(`No SQLite database at ${sqlitePath}. Nothing to import.`);
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put your Neon connection string in .env.local (see .env.example).");
  process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  console.log(`From ${sqlitePath}\nTo   ${new URL(url).hostname}\n`);
  await importFromSqlite({ sqlite, uploadDir, db: client, apply });
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  sqlite.close();
  await client.end().catch(() => {});
}

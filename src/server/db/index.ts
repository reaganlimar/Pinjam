import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { migrations } from "./schema";

export type Db = DatabaseSync;
export type Row = Record<string, unknown>;

/** Opens a database at `file` (or in memory) and brings its schema up to date. */
export function openDatabase(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: Db) {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = current; v < migrations.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(migrations[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

// Reuse one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { pinjamDb?: Db };

let override: Db | undefined;

/** Tests can point the data layer at an in-memory database. */
export function setDbForTesting(db: Db | undefined) {
  override = db;
}

export function getDb(): Db {
  if (override) return override;
  if (!globalForDb.pinjamDb) {
    const file = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "./data/pinjam.db");
    globalForDb.pinjamDb = openDatabase(file);
  }
  return globalForDb.pinjamDb;
}

/**
 * Runs `fn` inside an IMMEDIATE transaction. SQLite then allows only one writer at a
 * time, so check-then-write logic (like the loan overlap check) can't race.
 */
export function transaction<T>(fn: (db: Db) => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();

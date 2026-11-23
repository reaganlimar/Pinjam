import "server-only";
import { Pool, types, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { Database, type Driver, type Queryable } from "./database";

export { Database, PG, pgCode, pgConstraint, type Row } from "./database";
export { sql, raw, join } from "./sql";

/**
 * Postgres (Neon) connection. One pool per server instance; on Vercel Fluid compute
 * `attachDatabasePool` closes idle connections before the function is suspended.
 *
 * DATABASE_URL should be Neon's *pooled* connection string (host contains "-pooler").
 */

// Keep DATE columns as "YYYY-MM-DD" strings (the default would build a local-midnight Date
// and shift the day when converted to UTC). Counts (int8) come back as numbers.
const typeParsers = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === types.builtins.DATE) return (value: string) => value;
    if (oid === types.builtins.INT8) return (value: string) => Number(value);
    return types.getTypeParser(oid, format);
  },
} as unknown as typeof types;

function createPgDriver(): Driver {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon pooled connection string to .env.local (local) or the Vercel project settings.",
    );
  }
  const pool = new Pool({
    connectionString,
    types: typeParsers,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // A dropped idle connection must not crash the process; the pool replaces it.
  pool.on("error", (err) => console.error("Postgres pool error", err));
  attachDatabasePool(pool);

  return {
    query: (text, values) => pool.query(text, values),
    async transaction(fn) {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client as Queryable);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

// Reuse one driver across hot reloads in development.
const globalForDb = globalThis as unknown as { pinjamDriver?: Driver };
let override: Driver | undefined;

/** Tests point the data layer at an in-process Postgres (PGlite). */
export function setDriverForTesting(driver: Driver | undefined) {
  override = driver;
}

function driver(): Driver {
  if (override) return override;
  globalForDb.pinjamDriver ??= createPgDriver();
  return globalForDb.pinjamDriver;
}

export function getDb(): Database {
  return new Database(driver());
}

/**
 * Runs `fn` in a transaction on one connection. Code that checks and then writes
 * (e.g. loan overlap) also takes row locks (SELECT … FOR UPDATE) inside it.
 */
export function transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  return driver().transaction((conn) => fn(new Database(conn)));
}

export const nowIso = () => new Date().toISOString();

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import type { Driver, Row } from "@/server/db/database";
// Plain ESM helper shared with scripts/db-migrate.mjs.
import { applyMigrations } from "../../scripts/migrations-core.mjs";

const DATE_OID = 1082;

/**
 * An in-process Postgres (PGlite) with the real migrations applied, so tests exercise the
 * same SQL, constraints and transactions as Neon.
 */
export async function createTestDriver(): Promise<{ driver: Driver; close: () => Promise<void> }> {
  const pg = await PGlite.create({
    extensions: { btree_gist },
    parsers: { [DATE_OID]: (value: string) => value },
  });
  await applyMigrations({
    exec: (text: string) => pg.exec(text),
    query: (text: string, params?: unknown[]) => pg.query(text, params),
  });
  const driver: Driver = {
    query: (text, values) => pg.query<Row>(text, values),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (text, values) => tx.query<Row>(text, values) })),
  };
  return { driver, close: () => pg.close() };
}

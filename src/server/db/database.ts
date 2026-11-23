import { compile, type Sql } from "./sql";

export type Row = Record<string, unknown>;

/** Anything that can run a parameterised query (a pg Pool/Client, or PGlite in tests). */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount?: number | null; affectedRows?: number }>;
}

/** A driver adds transactions on a dedicated connection. */
export interface Driver extends Queryable {
  transaction<T>(fn: (conn: Queryable) => Promise<T>): Promise<T>;
}

/**
 * Normalises driver differences so services always see plain JSON-like values:
 * timestamps → ISO strings, bigint/int8 counts → numbers. (DATE columns are configured
 * in the drivers to stay as "YYYY-MM-DD" strings.)
 */
function normalise(row: Row): Row {
  for (const key in row) {
    const v = row[key];
    if (v instanceof Date) row[key] = v.toISOString();
    else if (typeof v === "bigint") row[key] = Number(v);
  }
  return row;
}

export class Database {
  constructor(private readonly conn: Queryable) {}

  async many<T = Row>(query: Sql): Promise<T[]> {
    const { text, values } = compile(query);
    const res = await this.conn.query(text, values);
    return res.rows.map(normalise) as T[];
  }

  async maybe<T = Row>(query: Sql): Promise<T | undefined> {
    return (await this.many<T>(query))[0];
  }

  async one<T = Row>(query: Sql): Promise<T> {
    const row = await this.maybe<T>(query);
    if (row === undefined) throw new Error("Expected a row but the query returned none");
    return row;
  }

  /** Runs a statement and returns the number of affected rows. */
  async run(query: Sql): Promise<number> {
    const { text, values } = compile(query);
    const res = await this.conn.query(text, values);
    return Number(res.rowCount ?? res.affectedRows ?? 0);
  }
}

/** Postgres error codes we turn into friendly messages. */
export const PG = {
  uniqueViolation: "23505",
  exclusionViolation: "23P01",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
} as const;

export function pgCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "constraint" in err
    ? String((err as { constraint: unknown }).constraint)
    : undefined;
}

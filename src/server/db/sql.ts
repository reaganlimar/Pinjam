/**
 * Tiny tagged-template SQL builder. Values become numbered parameters ($1, $2…), so
 * user input is never concatenated into SQL. Fragments can be nested and joined.
 *
 *   sql`SELECT * FROM items WHERE id = ${id}`
 *   sql`SELECT * FROM items WHERE ${join(conditions, " AND ")}`
 */
export class Sql {
  constructor(
    readonly strings: readonly string[],
    readonly values: readonly unknown[],
  ) {}
}

export function sql(strings: TemplateStringsArray, ...values: unknown[]): Sql {
  return new Sql(strings, values);
}

/** Trusted SQL text (never pass user input). */
export function raw(text: string): Sql {
  return new Sql([text], []);
}

export function join(parts: Sql[], separator = ", "): Sql {
  if (parts.length === 0) return raw("");
  const strings = ["", ...parts.slice(1).map(() => separator), ""];
  return new Sql(strings, parts);
}

/** Turns a (possibly nested) fragment into text + positional parameters. */
export function compile(query: Sql): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  let text = "";
  const walk = (q: Sql) => {
    q.strings.forEach((part, i) => {
      text += part;
      if (i < q.values.length) {
        const v = q.values[i];
        if (v instanceof Sql) walk(v);
        else {
          values.push(v);
          text += `$${values.length}`;
        }
      }
    });
  };
  walk(query);
  return { text, values };
}

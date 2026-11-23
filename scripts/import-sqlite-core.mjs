// Copies data from the old SQLite database (data/pinjam.db + data/uploads) into Postgres.
// Shared by scripts/import-sqlite.mjs. Read-only on the SQLite side; on the Postgres side it
// only INSERTs, inside one transaction, and refuses to run unless the app tables are empty.
import fs from "node:fs";
import path from "node:path";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const bool = (v) => v === 1 || v === true;

/** Tables in dependency order with the columns to copy and per-column converters. */
const TABLES = [
  {
    name: "users",
    columns: [
      "id", "email", "password_hash", "full_name", "nim", "major", "phone", "avatar_key", "student_id_card_key",
      "email_verified_at", "student_verified_at", "rules_accepted_at", "notify_reminders", "theme", "created_at", "updated_at",
    ],
    convert: { email: (v) => String(v).toLowerCase(), notify_reminders: bool },
  },
  { name: "files" }, // built from data/uploads, see below
  {
    name: "items",
    columns: [
      "id", "owner_id", "category_id", "name", "description", "condition", "price_per_day", "max_days", "pickup_point",
      "is_available", "deleted_at", "created_at", "updated_at",
    ],
    convert: { is_available: bool },
  },
  { name: "item_images", columns: ["id", "item_id", "file_key", "position"] },
  {
    name: "loans",
    columns: [
      "id", "item_id", "borrower_id", "lender_id", "start_date", "end_date", "days", "price_per_day", "fee_total",
      "payment_method", "fee_received_at", "note", "status", "return_condition", "reminder_sent_at", "created_at",
      "updated_at", "approved_at", "picked_up_at", "returned_at", "completed_at",
    ],
  },
  { name: "loan_events", columns: ["id", "loan_id", "actor_id", "from_status", "to_status", "note", "created_at"] },
  { name: "conversations", columns: ["id", "item_id", "borrower_id", "lender_id", "created_at", "last_message_at"] },
  { name: "messages", columns: ["id", "conversation_id", "sender_id", "body", "created_at", "read_at"] },
  { name: "reviews", columns: ["id", "loan_id", "reviewer_id", "reviewee_id", "rating", "comment", "created_at"] },
  { name: "notifications", columns: ["id", "user_id", "type", "title", "body", "link", "read_at", "created_at"] },
  { name: "reports", columns: ["id", "reporter_id", "item_id", "reason", "details", "status", "created_at"] },
];

const IDENTITY_TABLES = TABLES.map((t) => t.name).filter((n) => n !== "files");

/** Works out who owns each uploaded file from the rows that reference it. */
function collectFiles(sqlite, uploadDir) {
  const owners = new Map();
  for (const r of sqlite.prepare("SELECT id, avatar_key, student_id_card_key FROM users").all()) {
    if (r.avatar_key) owners.set(r.avatar_key, r.id);
    if (r.student_id_card_key) owners.set(r.student_id_card_key, r.id);
  }
  for (const r of sqlite.prepare("SELECT im.file_key, i.owner_id FROM item_images im JOIN items i ON i.id = im.item_id").all()) {
    owners.set(r.file_key, r.owner_id);
  }
  const files = [];
  const missing = [];
  for (const [key, ownerId] of owners) {
    const full = path.join(uploadDir, key);
    if (!fs.existsSync(full)) {
      missing.push(key);
      continue;
    }
    const data = fs.readFileSync(full);
    files.push({ key, owner_id: ownerId, kind: key.split("/")[0], mime: MIME[key.split(".").pop()], size: data.length, data });
  }
  return { files, missing };
}

/**
 * @param {{ sqlite: import("node:sqlite").DatabaseSync, uploadDir: string,
 *           db: { query(text: string, params?: unknown[]): Promise<{ rows: any[] }> },
 *           apply: boolean, log?: (msg: string) => void }} opts
 */
export async function importFromSqlite({ sqlite, uploadDir, db, apply, log = console.log }) {
  // 1. Target must have the schema and no app data yet.
  const migrated = await db.query("SELECT to_regclass('public.users') AS t");
  if (!migrated.rows[0].t) throw new Error("The Postgres schema is missing. Run `npm run db:migrate` first.");
  const existing = await db.query(
    `SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM items) + (SELECT count(*) FROM loans) AS n`,
  );
  if (Number(existing.rows[0].n) > 0) {
    throw new Error("Postgres already has users, items or loans. The import only runs into an empty database, so nothing was changed.");
  }

  // 2. Categories must line up (ids are copied as-is).
  const pgCats = new Map((await db.query("SELECT id, slug FROM categories")).rows.map((r) => [Number(r.id), r.slug]));
  for (const c of sqlite.prepare("SELECT id, slug FROM categories").all()) {
    if (pgCats.get(Number(c.id)) !== c.slug) throw new Error(`Category ${c.id} (${c.slug}) doesn't match Postgres.`);
  }

  // 3. Read everything.
  const { files, missing } = collectFiles(sqlite, uploadDir);
  const plan = TABLES.map((t) => ({
    ...t,
    rows: t.name === "files" ? files : sqlite.prepare(`SELECT ${t.columns.join(", ")} FROM ${t.name} ORDER BY id`).all(),
  }));
  for (const t of plan) log(`${t.name.padEnd(14)} ${t.rows.length} row(s)`);
  if (missing.length) log(`Skipping ${missing.length} referenced file(s) not found on disk: ${missing.join(", ")}`);
  if (!apply) {
    log("Dry run: nothing written. Re-run with --apply to import.");
    return { applied: false, counts: Object.fromEntries(plan.map((t) => [t.name, t.rows.length])) };
  }

  // 4. Insert in one transaction.
  const missingSet = new Set(missing);
  await db.query("BEGIN");
  try {
    for (const t of plan) {
      const columns = t.name === "files" ? ["key", "owner_id", "kind", "mime", "size", "data"] : t.columns;
      for (const row of t.rows) {
        if (t.name === "item_images" && missingSet.has(row.file_key)) continue;
        const values = columns.map((c) => {
          let v = row[c] ?? null;
          if (t.name === "users" && (c === "avatar_key" || c === "student_id_card_key") && missingSet.has(v)) v = null;
          return v !== null && t.convert?.[c] ? t.convert[c](v) : v;
        });
        const params = columns.map((_, i) => `$${i + 1}`).join(", ");
        await db.query(`INSERT INTO ${t.name} (${columns.join(", ")}) VALUES (${params})`, values);
      }
    }
    // Identity columns continue after the imported ids.
    for (const table of IDENTITY_TABLES) {
      await db.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT COALESCE(max(id), 0) FROM ${table}), 1),
                       (SELECT count(*) > 0 FROM ${table}))`,
      );
    }
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw new Error(`Import failed and was rolled back: ${err.message}`, { cause: err });
  }
  log("Import complete.");
  return { applied: true, counts: Object.fromEntries(plan.map((t) => [t.name, t.rows.length])) };
}

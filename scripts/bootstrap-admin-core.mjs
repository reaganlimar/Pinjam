// Shared logic for scripts/bootstrap-admin.mjs (Neon) and its tests (PGlite).
//
// Creates the first Pinjam administrator, or another one. It is the ONLY way an ADMIN
// account comes to exist: there is no admin sign-up page and no endpoint changes roles.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/** Used when neither --email nor ADMIN_EMAIL is given. Change it with either. */
export const DEFAULT_ADMIN_EMAIL = "admin@pinjam.local";
export const DEFAULT_ADMIN_NAME = "Pinjam Admin";
/** Same bcrypt cost as the app's sign-up and password change (src/server/services/users.ts). */
export const BCRYPT_ROUNDS = 10;
const LOCK_ID = 7_413_003; // arbitrary constant for pg_advisory_xact_lock

export class BootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
  }
}

/** 24 URL-safe characters from 18 random bytes (144 bits). */
export function generatePassword() {
  return crypto.randomBytes(18).toString("base64url");
}

export function normaliseEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new BootstrapError("invalid_email", `"${value}" is not a valid email address.`);
  }
  return email;
}

/**
 * Idempotent: running it again for an existing admin changes nothing and returns
 * status "exists" (no password). The password is only replaced with `rotate: true`.
 *
 * `db.transaction(fn)` runs `fn(conn)` in a transaction; `conn.query(text, params)` → { rows }.
 *
 * @param {{ transaction: (fn: (conn: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<any>) => Promise<any> }} db
 * @param {{ email?: string, fullName?: string, rotate?: boolean }} [options]
 * @returns {Promise<{ status: "created" | "exists" | "rotated", userId: number, email: string, password?: string }>}
 */
export async function bootstrapAdmin(db, { email: rawEmail, fullName = DEFAULT_ADMIN_NAME, rotate = false } = {}) {
  const email = normaliseEmail(rawEmail ?? DEFAULT_ADMIN_EMAIL);
  const name = String(fullName).trim();
  if (name.length < 2 || name.length > 80) throw new BootstrapError("invalid_name", "The admin name must be 2–80 characters.");

  return db.transaction(async (conn) => {
    const schema = await conn.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'",
    );
    if (schema.rows.length === 0) {
      throw new BootstrapError("schema_missing", "The users.role column doesn't exist yet. Run `npm run db:migrate` first.");
    }
    // Two bootstraps running at once (e.g. two terminals) take turns.
    await conn.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);

    const { rows } = await conn.query("SELECT id, role FROM users WHERE email = $1 FOR UPDATE", [email]);
    const existing = rows[0];

    if (existing && existing.role !== "ADMIN") {
      throw new BootstrapError(
        "student_conflict",
        `${email} already belongs to a student account (user ${existing.id}). It was NOT promoted to admin. ` +
          "Use a different admin email (--email or ADMIN_EMAIL). Promoting a student must be a deliberate, manual decision.",
      );
    }

    if (existing && !rotate) {
      return { status: "exists", userId: Number(existing.id), email };
    }
    if (!existing && rotate) {
      throw new BootstrapError("not_found", `There is no admin account for ${email}. Run without --rotate to create it.`);
    }

    const password = generatePassword();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let userId;
    if (existing) {
      userId = Number(existing.id);
      await conn.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, userId]);
      // A rotated password signs the admin out everywhere.
      await conn.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    } else {
      const inserted = await conn.query(
        `INSERT INTO users (email, password_hash, full_name, nim, role, rules_accepted_at)
         VALUES ($1, $2, $3, NULL, 'ADMIN', now()) RETURNING id`,
        [email, hash, name],
      );
      userId = Number(inserted.rows[0].id);
    }

    // Self-check before committing: the stored hash is bcrypt and accepts this password.
    const stored = (await conn.query("SELECT password_hash, role FROM users WHERE id = $1", [userId])).rows[0];
    if (stored.role !== "ADMIN" || stored.password_hash === password || !(await bcrypt.compare(password, stored.password_hash))) {
      throw new BootstrapError("self_check_failed", "The stored password hash didn't verify. Nothing was saved.");
    }
    return { status: existing ? "rotated" : "created", userId, email, password };
  });
}

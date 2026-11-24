import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { getDb, PG, pgCode, pgConstraint, sql, transaction, type Row } from "../db";
import { AppError, notFound } from "../errors";
import { TIME_ZONE } from "@/lib/format";
import type { Role, VerificationStatus } from "@/lib/verification";
import {
  changePasswordSchema,
  loginSchema,
  parse,
  profileSchema,
  registerSchema,
} from "../validation";

export type CurrentUser = {
  id: number;
  email: string;
  fullName: string;
  /** Student ID number. Admin accounts have none. */
  nim: string | null;
  major: string | null;
  phone: string | null;
  avatarKey: string | null;
  hasStudentIdCard: boolean;
  studentVerified: boolean;
  emailVerified: boolean;
  role: Role;
  isAdmin: boolean;
  verificationStatus: VerificationStatus;
  theme: "light" | "dark";
  notifyReminders: boolean;
  createdAt: string;
};

export function toCurrentUser(r: Row): CurrentUser {
  return {
    id: Number(r.id),
    email: String(r.email),
    fullName: String(r.full_name),
    nim: r.nim == null ? null : String(r.nim),
    major: (r.major as string) ?? null,
    phone: (r.phone as string) ?? null,
    avatarKey: (r.avatar_key as string) ?? null,
    hasStudentIdCard: Boolean(r.student_id_card_key),
    studentVerified: Boolean(r.student_verified_at),
    emailVerified: Boolean(r.email_verified_at),
    role: r.role === "ADMIN" ? "ADMIN" : "STUDENT",
    isAdmin: r.role === "ADMIN",
    verificationStatus: (r.verification_status as VerificationStatus) ?? "UNVERIFIED",
    theme: r.theme === "dark" ? "dark" : "light",
    notifyReminders: r.notify_reminders === true,
    createdAt: String(r.created_at),
  };
}

const USER_COLUMNS = sql`id, email, full_name, nim, major, phone, avatar_key, student_id_card_key,
  student_verified_at, email_verified_at, role, verification_status, theme, notify_reminders, created_at`;

// ---------------------------------------------------------------- registration / login

function duplicateError(field: "email" | "nim") {
  return new AppError("An account already exists.", "conflict", {
    [field]: field === "email" ? "This email is already registered." : "This student ID is already registered.",
  });
}

/**
 * Creates the account. `attachIdCard` lets the caller store the uploaded ID card in the
 * same transaction once the new user's id is known.
 */
export async function registerUser(
  input: unknown,
  attachIdCard?: (userId: number, db: import("../db").Database) => Promise<string | null>,
): Promise<CurrentUser> {
  const data = parse(registerSchema, input);
  const passwordHash = await bcrypt.hash(data.password, 10);
  try {
    return await transaction(async (db) => {
      const clash = await db.maybe<{ email: string }>(
        sql`SELECT email FROM users WHERE email = ${data.email} OR nim = ${data.nim} LIMIT 1`,
      );
      if (clash) throw duplicateError(clash.email === data.email ? "email" : "nim");
      const row = await db.one(sql`
        INSERT INTO users (email, password_hash, full_name, nim, rules_accepted_at)
        VALUES (${data.email}, ${passwordHash}, ${data.fullName}, ${data.nim}, now())
        RETURNING ${USER_COLUMNS}`);
      const user = toCurrentUser(row);
      const cardKey = attachIdCard ? await attachIdCard(user.id, db) : null;
      if (cardKey) {
        await db.run(sql`UPDATE users SET student_id_card_key = ${cardKey} WHERE id = ${user.id}`);
        user.hasStudentIdCard = true;
      }
      return user;
    });
  } catch (err) {
    // Two sign-ups racing for the same email/NIM: the unique constraint decides.
    if (pgCode(err) === PG.uniqueViolation) {
      throw duplicateError(pgConstraint(err) === "users_nim_key" ? "nim" : "email");
    }
    throw err;
  }
}

let cachedDummyHash: string | undefined;
const dummyHash = () => (cachedDummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

export async function verifyCredentials(input: unknown): Promise<CurrentUser> {
  const data = parse(loginSchema, input);
  const row = await getDb().maybe(
    sql`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ${data.email}`,
  );
  // Compare against a dummy hash when the user doesn't exist to keep timing similar.
  const ok = await bcrypt.compare(data.password, row ? String(row.password_hash) : dummyHash());
  if (!row || !ok) throw new AppError("Email or password is incorrect.", "unauthenticated");
  return toCurrentUser(row);
}

// ---------------------------------------------------------------- sessions

export const SESSION_DAYS = 30;
/** Admin sessions are short-lived: an admin signs in again after 12 hours. */
export const ADMIN_SESSION_HOURS = 12;

export function sessionLifetimeMs(role: Role): number {
  return role === "ADMIN" ? ADMIN_SESSION_HOURS * 60 * 60 * 1000 : SESSION_DAYS * 24 * 60 * 60 * 1000;
}

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Creates a session and returns the raw token to store in the cookie. */
export async function createSession(
  userId: number,
  lifetimeMs = sessionLifetimeMs("STUDENT"),
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + lifetimeMs);
  await getDb().run(
    sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${expiresAt.toISOString()})`,
  );
  return { token, expiresAt };
}

export async function findUserBySession(token: string): Promise<CurrentUser | null> {
  const row = await getDb().maybe(sql`
    SELECT ${USER_COLUMNS} FROM users
    WHERE id = (SELECT user_id FROM sessions WHERE id = ${hashToken(token)} AND expires_at > now())`);
  return row ? toCurrentUser(row) : null;
}

export async function deleteSession(token: string) {
  await getDb().run(sql`DELETE FROM sessions WHERE id = ${hashToken(token)} OR expires_at < now()`);
}

// ---------------------------------------------------------------- profile

export async function getUser(id: number): Promise<CurrentUser> {
  const row = await getDb().maybe(sql`SELECT ${USER_COLUMNS} FROM users WHERE id = ${id}`);
  if (!row) throw notFound("That student");
  return toCurrentUser(row);
}

/** Updates profile fields; returns the replaced avatar key (if any) so it can be deleted. */
export async function updateProfile(userId: number, input: unknown, avatarKey?: string | null) {
  const data = parse(profileSchema, input);
  const db = getDb();
  const previous = await db.one<{ avatar_key: string | null }>(sql`SELECT avatar_key FROM users WHERE id = ${userId}`);
  await db.run(sql`
    UPDATE users SET full_name = ${data.fullName}, major = ${data.major}, phone = ${data.phone},
      avatar_key = COALESCE(${avatarKey ?? null}::text, avatar_key), updated_at = now()
    WHERE id = ${userId}`);
  return { replacedAvatarKey: avatarKey ? previous.avatar_key : null };
}

export async function changePassword(userId: number, input: unknown, keepSessionToken: string | null) {
  const data = parse(changePasswordSchema, input);
  const row = await getDb().one<{ password_hash: string }>(sql`SELECT password_hash FROM users WHERE id = ${userId}`);
  if (!(await bcrypt.compare(data.currentPassword, row.password_hash))) {
    throw new AppError("Current password is incorrect.", "invalid", {
      currentPassword: "Current password is incorrect.",
    });
  }
  const hash = await bcrypt.hash(data.newPassword, 10);
  await transaction(async (db) => {
    await db.run(sql`UPDATE users SET password_hash = ${hash}, updated_at = now() WHERE id = ${userId}`);
    // Sign out other devices.
    await db.run(
      sql`DELETE FROM sessions WHERE user_id = ${userId} AND id <> ${keepSessionToken ? hashToken(keepSessionToken) : ""}`,
    );
  });
}

export async function updatePreferences(userId: number, prefs: { theme?: "light" | "dark"; notifyReminders?: boolean }) {
  const db = getDb();
  if (prefs.theme) await db.run(sql`UPDATE users SET theme = ${prefs.theme} WHERE id = ${userId}`);
  if (prefs.notifyReminders !== undefined) {
    await db.run(sql`UPDATE users SET notify_reminders = ${prefs.notifyReminders} WHERE id = ${userId}`);
  }
}

// ---------------------------------------------------------------- public profile + stats

export type UserStats = {
  itemsListed: number;
  timesLent: number;
  timesBorrowed: number;
  activeLoans: number;
  /** Share of completed borrows returned on or before the due date (null if none yet). */
  onTimeRate: number | null;
  /** Share of completed lends where the item came back in the same condition (null if none yet). */
  returnedOkRate: number | null;
  rating: number | null;
  reviewCount: number;
};

export async function getUserStats(userId: number): Promise<UserStats> {
  const r = await getDb().one<Record<string, number | string | null>>(sql`
    SELECT
      (SELECT count(*) FROM items WHERE owner_id = ${userId} AND deleted_at IS NULL) AS items_listed,
      (SELECT count(*) FROM loans WHERE lender_id = ${userId} AND status = 'completed') AS times_lent,
      (SELECT count(*) FROM loans WHERE borrower_id = ${userId}
         AND status IN ('borrowed', 'return_pending', 'completed')) AS times_borrowed,
      (SELECT count(*) FROM loans WHERE borrower_id = ${userId}
         AND status IN ('approved', 'ready_for_pickup', 'borrowed', 'return_pending')) AS active_loans,
      (SELECT count(*) FROM loans WHERE borrower_id = ${userId} AND status = 'completed') AS completed_borrows,
      (SELECT count(*) FROM loans WHERE borrower_id = ${userId} AND status = 'completed'
         AND (COALESCE(returned_at, completed_at) AT TIME ZONE ${TIME_ZONE})::date <= end_date) AS on_time,
      (SELECT count(*) FROM loans WHERE lender_id = ${userId} AND status = 'completed'
         AND COALESCE(return_condition, 'same') = 'same') AS lender_ok,
      (SELECT avg(rating) FROM reviews WHERE reviewee_id = ${userId}) AS rating,
      (SELECT count(*) FROM reviews WHERE reviewee_id = ${userId}) AS review_count`);
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    itemsListed: n("items_listed"),
    timesLent: n("times_lent"),
    timesBorrowed: n("times_borrowed"),
    activeLoans: n("active_loans"),
    onTimeRate: n("completed_borrows") ? n("on_time") / n("completed_borrows") : null,
    returnedOkRate: n("times_lent") ? n("lender_ok") / n("times_lent") : null,
    rating: r.rating === null ? null : Math.round(Number(r.rating) * 10) / 10,
    reviewCount: n("review_count"),
  };
}

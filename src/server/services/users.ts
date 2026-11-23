import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { getDb, nowIso, transaction, type Row } from "../db";
import { AppError, notFound } from "../errors";
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
  nim: string;
  major: string | null;
  phone: string | null;
  avatarKey: string | null;
  hasStudentIdCard: boolean;
  studentVerified: boolean;
  emailVerified: boolean;
  theme: "light" | "dark";
  notifyReminders: boolean;
  createdAt: string;
};

export function toCurrentUser(r: Row): CurrentUser {
  return {
    id: Number(r.id),
    email: String(r.email),
    fullName: String(r.full_name),
    nim: String(r.nim),
    major: (r.major as string) ?? null,
    phone: (r.phone as string) ?? null,
    avatarKey: (r.avatar_key as string) ?? null,
    hasStudentIdCard: Boolean(r.student_id_card_key),
    studentVerified: Boolean(r.student_verified_at),
    emailVerified: Boolean(r.email_verified_at),
    theme: r.theme === "dark" ? "dark" : "light",
    notifyReminders: Number(r.notify_reminders) === 1,
    createdAt: String(r.created_at),
  };
}

// ---------------------------------------------------------------- registration / login

export async function registerUser(input: unknown, studentIdCardKey: string | null): Promise<CurrentUser> {
  const data = parse(registerSchema, input);
  const passwordHash = await bcrypt.hash(data.password, 10);
  return transaction((db) => {
    const clash = db
      .prepare("SELECT email, nim FROM users WHERE email = ? OR nim = ?")
      .get(data.email, data.nim) as Row | undefined;
    if (clash) {
      const field = String(clash.email).toLowerCase() === data.email ? "email" : "nim";
      throw new AppError("An account already exists.", "conflict", {
        [field]: field === "email" ? "This email is already registered." : "This student ID is already registered.",
      });
    }
    const now = nowIso();
    const row = db
      .prepare(
        `INSERT INTO users (email, password_hash, full_name, nim, student_id_card_key,
                            rules_accepted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(data.email, passwordHash, data.fullName, data.nim, studentIdCardKey, now, now, now) as Row;
    return toCurrentUser(row);
  });
}

let cachedDummyHash: string | undefined;
const dummyHash = () => (cachedDummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

export async function verifyCredentials(input: unknown): Promise<CurrentUser> {
  const data = parse(loginSchema, input);
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(data.email) as Row | undefined;
  // Compare against a dummy hash when the user doesn't exist to keep timing similar.
  const hash = row ? String(row.password_hash) : dummyHash();
  const ok = await bcrypt.compare(data.password, hash);
  if (!row || !ok) throw new AppError("Email or password is incorrect.", "unauthenticated");
  return toCurrentUser(row);
}

// ---------------------------------------------------------------- sessions

export const SESSION_DAYS = 30;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Creates a session and returns the raw token to store in the cookie. */
export function createSession(userId: number): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  getDb()
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(token), userId, expiresAt.toISOString(), nowIso());
  return { token, expiresAt };
}

export function findUserBySession(token: string): CurrentUser | null {
  const row = getDb()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), nowIso()) as Row | undefined;
  return row ? toCurrentUser(row) : null;
}

export function deleteSession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
}

// ---------------------------------------------------------------- profile

export function getUser(id: number): CurrentUser {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw notFound("That student");
  return toCurrentUser(row);
}

export function updateProfile(userId: number, input: unknown, avatarKey?: string | null) {
  const data = parse(profileSchema, input);
  const db = getDb();
  const previous = db.prepare("SELECT avatar_key FROM users WHERE id = ?").get(userId) as Row;
  db.prepare(
    `UPDATE users SET full_name = ?, major = ?, phone = ?, avatar_key = COALESCE(?, avatar_key), updated_at = ?
     WHERE id = ?`,
  ).run(data.fullName, data.major, data.phone, avatarKey ?? null, nowIso(), userId);
  return { replacedAvatarKey: avatarKey ? ((previous.avatar_key as string) ?? null) : null };
}

export function setStudentIdCard(userId: number, key: string) {
  const db = getDb();
  const previous = db.prepare("SELECT student_id_card_key FROM users WHERE id = ?").get(userId) as Row;
  db.prepare("UPDATE users SET student_id_card_key = ?, updated_at = ? WHERE id = ?").run(key, nowIso(), userId);
  return (previous.student_id_card_key as string) ?? null;
}

export function getStudentIdCardKey(userId: number): string | null {
  const row = getDb().prepare("SELECT student_id_card_key FROM users WHERE id = ?").get(userId) as Row | undefined;
  return (row?.student_id_card_key as string) ?? null;
}

export async function changePassword(userId: number, input: unknown, keepSessionToken: string | null) {
  const data = parse(changePasswordSchema, input);
  const db = getDb();
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as Row;
  if (!(await bcrypt.compare(data.currentPassword, String(row.password_hash)))) {
    throw new AppError("Current password is incorrect.", "invalid", {
      currentPassword: "Current password is incorrect.",
    });
  }
  const hash = await bcrypt.hash(data.newPassword, 10);
  transaction((tx) => {
    tx.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hash, nowIso(), userId);
    // Sign out other devices.
    tx.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(
      userId,
      keepSessionToken ? hashToken(keepSessionToken) : "",
    );
  });
}

export function updatePreferences(userId: number, prefs: { theme?: "light" | "dark"; notifyReminders?: boolean }) {
  const db = getDb();
  if (prefs.theme) db.prepare("UPDATE users SET theme = ? WHERE id = ?").run(prefs.theme, userId);
  if (prefs.notifyReminders !== undefined) {
    db.prepare("UPDATE users SET notify_reminders = ? WHERE id = ?").run(prefs.notifyReminders ? 1 : 0, userId);
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
  /** Share of completed lends where the item came back (null if none yet). */
  returnedOkRate: number | null;
  rating: number | null;
  reviewCount: number;
};

export function getUserStats(userId: number): UserStats {
  const db = getDb();
  const one = (sql: string, ...args: (string | number)[]) =>
    Number((db.prepare(sql).get(...args) as Row).n ?? 0);

  const itemsListed = one("SELECT COUNT(*) n FROM items WHERE owner_id = ? AND deleted_at IS NULL", userId);
  const timesLent = one("SELECT COUNT(*) n FROM loans WHERE lender_id = ? AND status = 'completed'", userId);
  const timesBorrowed = one(
    "SELECT COUNT(*) n FROM loans WHERE borrower_id = ? AND status IN ('borrowed','return_pending','completed')",
    userId,
  );
  const activeLoans = one(
    "SELECT COUNT(*) n FROM loans WHERE borrower_id = ? AND status IN ('approved','ready_for_pickup','borrowed','return_pending')",
    userId,
  );
  const completedBorrows = one("SELECT COUNT(*) n FROM loans WHERE borrower_id = ? AND status = 'completed'", userId);
  const onTime = one(
    `SELECT COUNT(*) n FROM loans WHERE borrower_id = ? AND status = 'completed'
       AND substr(COALESCE(returned_at, completed_at), 1, 10) <= end_date`,
    userId,
  );
  const lenderClosed = one(
    "SELECT COUNT(*) n FROM loans WHERE lender_id = ? AND status = 'completed'",
    userId,
  );
  const lenderOk = one(
    "SELECT COUNT(*) n FROM loans WHERE lender_id = ? AND status = 'completed' AND COALESCE(return_condition,'same') = 'same'",
    userId,
  );
  const rating = db
    .prepare("SELECT AVG(rating) avg, COUNT(*) n FROM reviews WHERE reviewee_id = ?")
    .get(userId) as Row;

  return {
    itemsListed,
    timesLent,
    timesBorrowed,
    activeLoans,
    onTimeRate: completedBorrows ? onTime / completedBorrows : null,
    returnedOkRate: lenderClosed ? lenderOk / lenderClosed : null,
    rating: rating.avg === null ? null : Math.round(Number(rating.avg) * 10) / 10,
    reviewCount: Number(rating.n),
  };
}

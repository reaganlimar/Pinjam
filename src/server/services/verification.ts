import "server-only";
import { getDb, join, PG, pgCode, pgConstraint, sql, transaction, type Database, type Row } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { parse, reviewDecisionSchema, verificationSchema } from "../validation";
import { assertAdmin } from "../permissions";
import { readImage, saveImage } from "../storage";
import { notify } from "./notifications";
import { getOcrProvider } from "../verification/ocr";
import { analyseOcrText, normalise, normaliseStudentNumber } from "../verification/compare";
import {
  CAN_SUBMIT_FROM,
  DECISION_STATUS,
  SUBMISSION_STATUSES,
  type OcrComparison,
  type OcrStatus,
  type SubmissionStatus,
  type VerificationStatus,
} from "@/lib/verification";

/**
 * Student ID verification. Students submit their card; an admin makes every decision.
 * OCR (src/server/verification/) runs after the submission is saved and only fills the
 * ocr_* columns, so it can never approve anyone.
 */

// ---------------------------------------------------------------- retention policy

/**
 * Days an ID photo is kept after the admin's decision (ID_IMAGE_RETENTION_DAYS, default 30).
 * 0 deletes the photo as soon as the decision is made. Pending submissions always keep theirs.
 */
export function retentionDays(): number {
  const raw = process.env.ID_IMAGE_RETENTION_DAYS;
  const n = raw === undefined || raw.trim() === "" ? 30 : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 30;
}

function retentionCutoff(now = new Date()) {
  return new Date(now.getTime() - retentionDays() * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------- shared helpers

type EventAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "resubmission_requested"
  | "ocr_completed"
  | "ocr_failed"
  | "image_deleted";

async function logEvent(db: Database, submissionId: number, actorId: number | null, action: EventAction, note?: string | null) {
  await db.run(sql`
    INSERT INTO verification_events (submission_id, actor_id, action, note)
    VALUES (${submissionId}, ${actorId}, ${action}, ${note ?? null})`);
}

const duplicatePending = () =>
  new AppError("You already have a submission under review. We'll notify you when an admin has checked it.", "conflict");

const opt = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? null : String(r[k]));

/** Deletes a submission's ID photo (and the OCR text read from it). */
async function removeImage(db: Database, submissionId: number, actorId: number | null, note: string): Promise<boolean> {
  const row = await db.maybe<{ id_image_key: string | null }>(
    sql`SELECT id_image_key FROM verification_submissions WHERE id = ${submissionId} FOR UPDATE`,
  );
  if (!row?.id_image_key) return false;
  await db.run(sql`
    UPDATE verification_submissions
    SET id_image_key = NULL, id_image_deleted_at = now(), ocr_raw_text = NULL, updated_at = now()
    WHERE id = ${submissionId}`);
  await db.run(sql`DELETE FROM files WHERE key = ${row.id_image_key}`);
  await logEvent(db, submissionId, actorId, "image_deleted", note);
  return true;
}

// ---------------------------------------------------------------- student side

export type StudentSubmission = {
  id: number;
  status: SubmissionStatus;
  fullName: string;
  studentNumber: string;
  university: string;
  imageKey: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  /** Rejection / resubmission explanation written for the student. */
  decisionReason: string | null;
};

export type MyVerification = {
  status: VerificationStatus;
  canSubmit: boolean;
  latest: StudentSubmission | null;
};

export async function getMyVerification(userId: number): Promise<MyVerification> {
  const db = getDb();
  const user = await db.maybe<{ role: string; verification_status: VerificationStatus }>(
    sql`SELECT role, verification_status FROM users WHERE id = ${userId}`,
  );
  if (!user) throw notFound("Your account");
  const r = await db.maybe(sql`
    SELECT id, status, full_name, student_number, university, id_image_key, submitted_at, reviewed_at, decision_reason
    FROM verification_submissions WHERE user_id = ${userId} ORDER BY submitted_at DESC, id DESC LIMIT 1`);
  return {
    status: user.verification_status,
    canSubmit: user.role === "STUDENT" && CAN_SUBMIT_FROM.includes(user.verification_status),
    latest: r
      ? {
          id: Number(r.id),
          status: r.status as SubmissionStatus,
          fullName: String(r.full_name),
          studentNumber: String(r.student_number),
          university: String(r.university),
          imageKey: opt(r, "id_image_key"),
          submittedAt: String(r.submitted_at),
          reviewedAt: opt(r, "reviewed_at"),
          decisionReason: opt(r, "decision_reason"),
        }
      : null,
  };
}

/**
 * Creates a PENDING submission with the student's typed details and ID photo. The photo is
 * checked by its file signature (not its name) and stored privately in the same transaction.
 * Returns the submission id; call `runOcrForSubmission` afterwards (it is safe to skip).
 */
export async function submitVerification(userId: number, input: unknown, image: File): Promise<number> {
  const data = parse(verificationSchema, input);
  try {
    return await transaction(async (db) => {
      // Lock the student's row so two submissions can't race past the status check.
      const user = await db.maybe<{ role: string; verification_status: VerificationStatus }>(
        sql`SELECT role, verification_status FROM users WHERE id = ${userId} FOR UPDATE`,
      );
      if (!user) throw notFound("Your account");
      if (user.role === "ADMIN") throw forbidden("Admin accounts don't need student verification.");
      if (user.verification_status === "APPROVED") throw new AppError("Your student ID is already verified.", "conflict");
      if (user.verification_status === "PENDING") throw duplicatePending();

      let key: string;
      try {
        key = await saveImage(image, "idcard", userId, db);
      } catch (err) {
        if (err instanceof AppError) throw new AppError(err.message, "invalid", { idPhoto: err.message });
        throw err;
      }
      const ocrStatus: OcrStatus = getOcrProvider() ? "pending" : "not_configured";
      const { id } = await db.one<{ id: number }>(sql`
        INSERT INTO verification_submissions (user_id, full_name, student_number, university, id_image_key, ocr_status)
        VALUES (${userId}, ${data.fullName}, ${data.studentNumber}, ${data.university}, ${key}, ${ocrStatus})
        RETURNING id`);
      await db.run(sql`UPDATE users SET verification_status = 'PENDING', updated_at = now() WHERE id = ${userId}`);
      await logEvent(db, Number(id), userId, "submitted");
      return Number(id);
    });
  } catch (err) {
    if (pgCode(err) === PG.uniqueViolation && pgConstraint(err) === "verification_one_pending_per_user") {
      throw duplicatePending();
    }
    throw err;
  }
}

// ---------------------------------------------------------------- OCR (assistance only)

/**
 * Reads the ID photo with the configured OCR provider and stores the extracted fields and
 * the comparison with what the student typed. Never throws and never changes `status`:
 * if OCR is off or fails, the submission simply stays in manual review.
 */
export async function runOcrForSubmission(submissionId: number): Promise<OcrStatus | null> {
  const db = getDb();
  try {
    const row = await db.maybe(sql`
      SELECT id, full_name, student_number, university, id_image_key
      FROM verification_submissions WHERE id = ${submissionId}`);
    if (!row) return null;
    const provider = getOcrProvider();
    if (!provider) {
      await db.run(sql`
        UPDATE verification_submissions SET ocr_status = 'not_configured', ocr_provider = NULL
        WHERE id = ${submissionId} AND ocr_status = 'pending'`);
      return "not_configured";
    }
    const file = row.id_image_key ? await readImage(String(row.id_image_key)) : null;
    if (!file) throw new Error("The ID photo is no longer stored.");
    await db.run(sql`
      UPDATE verification_submissions SET ocr_status = 'pending', ocr_provider = ${provider.name}, ocr_error = NULL
      WHERE id = ${submissionId}`);

    const result = await provider.recognize(file.bytes);
    const analysis = analyseOcrText(result.text, {
      fullName: String(row.full_name),
      studentNumber: String(row.student_number),
      university: String(row.university),
    });
    const stored = await db.run(sql`
      UPDATE verification_submissions SET
        ocr_status = 'completed', ocr_provider = ${provider.name}, ocr_raw_text = ${result.text.slice(0, 5000)},
        ocr_confidence = ${result.confidence}, ocr_extracted = ${JSON.stringify(analysis.extracted)}::jsonb,
        ocr_comparison = ${JSON.stringify(analysis.comparison)}::jsonb, ocr_has_mismatch = ${analysis.hasMismatch},
        ocr_error = NULL, ocr_completed_at = now()
      WHERE id = ${submissionId} AND id_image_key IS NOT NULL`);
    if (!stored) return null; // the photo was deleted while OCR ran
    await logEvent(
      db,
      submissionId,
      null,
      "ocr_completed",
      analysis.hasMismatch ? "Possible mismatch flagged for review" : "All fields matched the photo",
    );
    return "completed";
  } catch (err) {
    // Log the error only: never the OCR text or the student's details.
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    console.error(`OCR failed for verification submission ${submissionId}: ${message}`);
    try {
      await db.run(sql`
        UPDATE verification_submissions SET ocr_status = 'failed', ocr_error = ${message}, ocr_completed_at = now()
        WHERE id = ${submissionId}`);
      await logEvent(db, submissionId, null, "ocr_failed", message);
    } catch (inner) {
      console.error(`Could not record the OCR failure for submission ${submissionId}`, inner);
    }
    return "failed";
  }
}

/** Admin-triggered re-run, e.g. after OCR failed or was switched on later. */
export async function rerunOcr(adminId: number, submissionId: number): Promise<OcrStatus | null> {
  const db = getDb();
  await assertAdmin(db, adminId);
  if (!(await db.maybe(sql`SELECT 1 FROM verification_submissions WHERE id = ${submissionId}`))) {
    throw notFound("That submission");
  }
  return runOcrForSubmission(submissionId);
}

// ---------------------------------------------------------------- admin: overview + lists

export type AdminOverview = {
  totalStudents: number;
  verifiedStudents: number;
  pending: number;
  rejected: number;
  resubmissionRequired: number;
  /** Pending submissions where OCR flagged a mismatch, failed, or is off. */
  needsAttention: number;
  /** Reviewed submissions whose photo is past the retention period. */
  expiredImages: number;
  retentionDays: number;
};

export async function adminOverview(adminId: number): Promise<AdminOverview> {
  const db = getDb();
  await assertAdmin(db, adminId);
  const r = await db.one<Record<string, number>>(sql`
    SELECT
      (SELECT count(*) FROM users WHERE role = 'STUDENT') AS students,
      (SELECT count(*) FROM users WHERE role = 'STUDENT' AND verification_status = 'APPROVED') AS verified,
      (SELECT count(*) FROM verification_submissions WHERE status = 'PENDING') AS pending,
      (SELECT count(*) FROM verification_submissions WHERE status = 'REJECTED') AS rejected,
      (SELECT count(*) FROM verification_submissions WHERE status = 'RESUBMISSION_REQUIRED') AS resubmission,
      (SELECT count(*) FROM verification_submissions WHERE status = 'PENDING'
         AND (ocr_has_mismatch IS TRUE OR ocr_status IN ('failed', 'not_configured'))) AS attention,
      (SELECT count(*) FROM verification_submissions WHERE status <> 'PENDING' AND id_image_key IS NOT NULL
         AND reviewed_at <= ${retentionCutoff()}::timestamptz) AS expired`);
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    totalStudents: n("students"),
    verifiedStudents: n("verified"),
    pending: n("pending"),
    rejected: n("rejected"),
    resubmissionRequired: n("resubmission"),
    needsAttention: n("attention"),
    expiredImages: n("expired"),
    retentionDays: retentionDays(),
  };
}

export type AdminSubmissionRow = {
  id: number;
  status: SubmissionStatus;
  fullName: string;
  studentNumber: string;
  university: string;
  submittedAt: string;
  reviewedAt: string | null;
  ocrStatus: OcrStatus;
  ocrHasMismatch: boolean | null;
  user: { id: number; name: string; email: string; nim: string | null };
};

const ROW_SELECT = sql`
  SELECT s.id, s.status, s.full_name, s.student_number, s.university, s.submitted_at, s.reviewed_at,
         s.ocr_status, s.ocr_has_mismatch, u.id AS user_id, u.full_name AS user_name, u.email AS user_email, u.nim AS user_nim
  FROM verification_submissions s JOIN users u ON u.id = s.user_id`;

function toRow(r: Row): AdminSubmissionRow {
  return {
    id: Number(r.id),
    status: r.status as SubmissionStatus,
    fullName: String(r.full_name),
    studentNumber: String(r.student_number),
    university: String(r.university),
    submittedAt: String(r.submitted_at),
    reviewedAt: opt(r, "reviewed_at"),
    ocrStatus: r.ocr_status as OcrStatus,
    ocrHasMismatch: r.ocr_has_mismatch === null || r.ocr_has_mismatch === undefined ? null : r.ocr_has_mismatch === true,
    user: { id: Number(r.user_id), name: String(r.user_name), email: String(r.user_email), nim: opt(r, "user_nim") },
  };
}

export type SubmissionFilters = { status?: SubmissionStatus; q?: string; page?: number };
export const PAGE_SIZE = 25;

/** Search by student name (typed or account), email, or student ID / NIM; filter by status. */
export async function listSubmissions(
  adminId: number,
  filters: SubmissionFilters = {},
): Promise<{ rows: AdminSubmissionRow[]; total: number; page: number; pageCount: number }> {
  const db = getDb();
  await assertAdmin(db, adminId);
  const where = [sql`TRUE`];
  if (filters.status && (SUBMISSION_STATUSES as readonly string[]).includes(filters.status)) {
    where.push(sql`s.status = ${filters.status}`);
  }
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    const digits = normaliseStudentNumber(q);
    // Student numbers are stored without separators, so "2602-0000" still finds "26020000…".
    const numberMatch = digits ? sql` OR s.student_number LIKE ${`%${digits}%`}` : sql``;
    where.push(sql`(s.full_name ILIKE ${pattern} OR u.full_name ILIKE ${pattern} OR u.email ILIKE ${pattern}
      OR u.nim ILIKE ${pattern}${numberMatch})`);
  }
  const whereSql = join(where, " AND ");
  const total = Number((await db.one<{ n: number }>(sql`
    SELECT count(*) AS n FROM verification_submissions s JOIN users u ON u.id = s.user_id WHERE ${whereSql}`)).n);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1)), pageCount);
  // The review queue is first-come, first-served; everything else shows the newest first.
  const order =
    filters.status === "PENDING" ? sql`s.submitted_at ASC, s.id ASC` : sql`(s.status = 'PENDING') DESC, s.submitted_at DESC, s.id DESC`;
  const rows = await db.many(sql`
    ${ROW_SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`);
  return { rows: rows.map(toRow), total, page, pageCount };
}

// ---------------------------------------------------------------- admin: one submission

export type AdminSubmissionDetail = AdminSubmissionRow & {
  hasImage: boolean;
  imageDeletedAt: string | null;
  ocr: {
    status: OcrStatus;
    provider: string | null;
    confidence: number | null;
    comparison: OcrComparison | null;
    rawText: string | null;
    error: string | null;
    completedAt: string | null;
  };
  reviewer: { id: number; name: string; email: string } | null;
  decisionReason: string | null;
  adminNotes: string | null;
  account: { verificationStatus: VerificationStatus; createdAt: string; registeredName: string };
  /** Things that don't add up, for the admin to weigh (never decisive on their own). */
  warnings: string[];
  history: AdminSubmissionRow[];
  events: { id: number; action: EventAction; actorName: string | null; note: string | null; createdAt: string }[];
};

export async function getSubmissionForAdmin(adminId: number, submissionId: number): Promise<AdminSubmissionDetail> {
  const db = getDb();
  await assertAdmin(db, adminId);
  const r = await db.maybe(sql`
    SELECT s.*, u.full_name AS user_name, u.email AS user_email, u.nim AS user_nim,
           u.verification_status AS user_status, u.created_at AS user_created_at,
           rv.full_name AS reviewer_name, rv.email AS reviewer_email
    FROM verification_submissions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users rv ON rv.id = s.reviewer_id
    WHERE s.id = ${submissionId}`);
  if (!r) throw notFound("That submission");
  const base = toRow(r);

  const [history, events, numberClashes] = await Promise.all([
    db.many(sql`${ROW_SELECT} WHERE s.user_id = ${base.user.id} AND s.id <> ${submissionId} ORDER BY s.submitted_at DESC`),
    db.many(sql`
      SELECT e.id, e.action, e.note, e.created_at, u.full_name AS actor_name
      FROM verification_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.submission_id = ${submissionId} ORDER BY e.id`),
    db.many<{ id: number; email: string; source: string }>(sql`
      SELECT u.id, u.email, 'account NIM' AS source FROM users u
        WHERE u.id <> ${base.user.id} AND upper(regexp_replace(u.nim, '[^A-Za-z0-9]', '', 'g')) = ${base.studentNumber}
      UNION
      SELECT u.id, u.email, lower(s.status) || ' submission' AS source
        FROM verification_submissions s JOIN users u ON u.id = s.user_id
        WHERE s.user_id <> ${base.user.id} AND s.student_number = ${base.studentNumber} AND s.status IN ('PENDING', 'APPROVED')`),
  ]);

  const warnings: string[] = [];
  if (base.user.nim && normaliseStudentNumber(base.user.nim) !== base.studentNumber) {
    warnings.push(`The student ID number differs from the NIM on the account (${base.user.nim}).`);
  }
  if (normalise(base.user.name) !== normalise(base.fullName)) {
    warnings.push(`The name differs from the account name (${base.user.name}).`);
  }
  for (const c of numberClashes) warnings.push(`This student ID number is also on another account (${c.email}, ${c.source}).`);
  if (r.ocr_status === "failed") warnings.push("OCR couldn't read the photo. Check every detail by eye.");
  if (r.ocr_status === "not_configured") warnings.push("OCR is off. Check every detail by eye.");

  return {
    ...base,
    hasImage: Boolean(r.id_image_key),
    imageDeletedAt: opt(r, "id_image_deleted_at"),
    ocr: {
      status: r.ocr_status as OcrStatus,
      provider: opt(r, "ocr_provider"),
      confidence: r.ocr_confidence === null || r.ocr_confidence === undefined ? null : Number(r.ocr_confidence),
      comparison: (r.ocr_comparison as OcrComparison | null) ?? null,
      rawText: opt(r, "ocr_raw_text"),
      error: opt(r, "ocr_error"),
      completedAt: opt(r, "ocr_completed_at"),
    },
    reviewer: r.reviewer_id
      ? { id: Number(r.reviewer_id), name: String(r.reviewer_name), email: String(r.reviewer_email) }
      : null,
    decisionReason: opt(r, "decision_reason"),
    adminNotes: opt(r, "admin_notes"),
    account: {
      verificationStatus: r.user_status as VerificationStatus,
      createdAt: String(r.user_created_at),
      registeredName: String(r.user_name),
    },
    warnings,
    history: history.map(toRow),
    events: events.map((e) => ({
      id: Number(e.id),
      action: e.action as EventAction,
      actorName: opt(e, "actor_name"),
      note: opt(e, "note"),
      createdAt: String(e.created_at),
    })),
  };
}

/** The ID photo, for admins only. Returns null when there is none (or it was deleted). */
export async function readSubmissionImage(adminId: number, submissionId: number) {
  const db = getDb();
  await assertAdmin(db, adminId);
  const row = await db.maybe<{ id_image_key: string | null }>(
    sql`SELECT id_image_key FROM verification_submissions WHERE id = ${submissionId}`,
  );
  return row?.id_image_key ? readImage(row.id_image_key) : null;
}

// ---------------------------------------------------------------- admin: decisions

const NOTICE: Record<Exclude<SubmissionStatus, "PENDING">, { type: Parameters<typeof notify>[2]["type"]; title: string; body: string }> = {
  APPROVED: {
    type: "verification_approved",
    title: "Your student ID is verified",
    body: "You can now borrow, list items and approve requests.",
  },
  REJECTED: {
    type: "verification_rejected",
    title: "Your student ID verification was rejected",
    body: "See the reason and submit again.",
  },
  RESUBMISSION_REQUIRED: {
    type: "verification_resubmission",
    title: "Please resubmit your student ID",
    body: "An admin needs a clearer photo or more details.",
  },
};

const EVENT_FOR: Record<Exclude<SubmissionStatus, "PENDING">, EventAction> = {
  APPROVED: "approved",
  REJECTED: "rejected",
  RESUBMISSION_REQUIRED: "resubmission_requested",
};

/**
 * Records an admin's decision on a pending submission: who decided, what, when, and why.
 * The submission and the student's status change together in one transaction.
 */
export async function decideSubmission(adminId: number, submissionId: number, input: unknown): Promise<SubmissionStatus> {
  const data = parse(reviewDecisionSchema, input);
  const to = DECISION_STATUS[data.decision];
  const reason = data.decision === "approve" ? null : data.reason;
  try {
    return await transaction(async (db) => {
      await assertAdmin(db, adminId);
      const s = await db.maybe<{ user_id: number; status: SubmissionStatus; student_number: string }>(
        sql`SELECT user_id, status, student_number FROM verification_submissions WHERE id = ${submissionId} FOR UPDATE`,
      );
      if (!s) throw notFound("That submission");
      if (s.status !== "PENDING") {
        throw new AppError("This submission was already reviewed. Refresh to see the decision.", "conflict");
      }
      const studentId = Number(s.user_id);
      if (studentId === adminId) throw forbidden("You can't review your own submission.");
      await db.run(sql`SELECT id FROM users WHERE id = ${studentId} FOR UPDATE`);

      await db.run(sql`
        UPDATE verification_submissions SET status = ${to}, reviewer_id = ${adminId}, reviewed_at = now(),
          decision_reason = ${reason}, admin_notes = ${data.notes}, updated_at = now()
        WHERE id = ${submissionId}`);
      await db.run(
        to === "APPROVED"
          ? sql`UPDATE users SET verification_status = 'APPROVED', student_verified_at = now(), updated_at = now()
                WHERE id = ${studentId}`
          : sql`UPDATE users SET verification_status = ${to}, student_verified_at = NULL, updated_at = now()
                WHERE id = ${studentId}`,
      );
      await logEvent(db, submissionId, adminId, EVENT_FOR[to], reason);
      const notice = NOTICE[to];
      await notify(db, studentId, {
        type: notice.type,
        title: notice.title,
        body: reason ? `${notice.body} Reason: ${reason}` : notice.body,
        link: "/verification",
      });
      if (retentionDays() === 0) await removeImage(db, submissionId, null, "Deleted at decision (retention set to 0 days)");
      return to;
    });
  } catch (err) {
    if (pgCode(err) === PG.uniqueViolation && pgConstraint(err) === "verification_approved_number_key") {
      throw new AppError(
        "Another account is already verified with this student ID number. Reject this submission or check the other account.",
        "conflict",
      );
    }
    throw err;
  }
}

/** Deletes the photo of a reviewed submission now, instead of waiting for the retention period. */
export async function deleteSubmissionImage(adminId: number, submissionId: number): Promise<boolean> {
  return transaction(async (db) => {
    await assertAdmin(db, adminId);
    const s = await db.maybe<{ status: SubmissionStatus }>(
      sql`SELECT status FROM verification_submissions WHERE id = ${submissionId} FOR UPDATE`,
    );
    if (!s) throw notFound("That submission");
    if (s.status === "PENDING") throw new AppError("Review the submission before deleting its photo.", "conflict");
    return removeImage(db, submissionId, adminId, "Deleted by admin");
  });
}

/**
 * Retention sweep: deletes photos of reviewed submissions older than ID_IMAGE_RETENTION_DAYS.
 * Run by admins from the dashboard, after each decision, or by `npm run verification:purge`.
 * `adminId` null means a trusted server-side caller (the CLI).
 */
export async function purgeExpiredIdImages(adminId: number | null, now = new Date()): Promise<number> {
  return transaction(async (db) => {
    if (adminId !== null) await assertAdmin(db, adminId);
    const expired = await db.many<{ id: number }>(sql`
      SELECT id FROM verification_submissions
      WHERE status <> 'PENDING' AND id_image_key IS NOT NULL AND reviewed_at <= ${retentionCutoff(now)}::timestamptz
      ORDER BY id FOR UPDATE`);
    let deleted = 0;
    for (const { id } of expired) {
      if (await removeImage(db, Number(id), adminId, `Retention policy (${retentionDays()} days after review)`)) deleted++;
    }
    return deleted;
  });
}

/**
 * Student ID verification: statuses and labels. Pure, shared by server and UI.
 *
 *   UNVERIFIED ──submit──▶ PENDING ──admin approves──▶ APPROVED
 *        ▲                    │
 *        │                    ├──admin rejects (reason)──────────▶ REJECTED ──────────────┐
 *        │                    └──admin asks to resubmit (reason)─▶ RESUBMISSION_REQUIRED ─┤
 *        └────────────────────── student submits again ◀──────────────────────────────────┘
 *
 * OCR only assists the admin. It never moves a submission between statuses.
 */

export const VERIFICATION_STATUSES = ["UNVERIFIED", "PENDING", "APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Statuses a submission row can have (a submission is never UNVERIFIED). */
export const SUBMISSION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const ROLES = ["STUDENT", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

/** Statuses from which a student may send a (new) submission. */
export const CAN_SUBMIT_FROM: readonly VerificationStatus[] = ["UNVERIFIED", "REJECTED", "RESUBMISSION_REQUIRED"];

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  UNVERIFIED: "Not verified",
  PENDING: "Under review",
  APPROVED: "Verified",
  REJECTED: "Rejected",
  RESUBMISSION_REQUIRED: "Resubmission needed",
};

export type Tone = "success" | "warning" | "info" | "neutral" | "danger";

export const VERIFICATION_TONE: Record<VerificationStatus, Tone> = {
  UNVERIFIED: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  RESUBMISSION_REQUIRED: "warning",
};

export const DECISIONS = ["approve", "reject", "request_resubmission"] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_STATUS: Record<Decision, Exclude<SubmissionStatus, "PENDING">> = {
  approve: "APPROVED",
  reject: "REJECTED",
  request_resubmission: "RESUBMISSION_REQUIRED",
};

export const OCR_STATUSES = ["not_configured", "pending", "completed", "failed"] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

export const OCR_STATUS_LABEL: Record<OcrStatus, string> = {
  not_configured: "OCR off: manual review",
  pending: "OCR running",
  completed: "OCR done",
  failed: "OCR failed: manual review",
};

export type FieldResult = "match" | "partial" | "mismatch" | "not_found";

export const FIELD_RESULT_LABEL: Record<FieldResult, string> = {
  match: "Matches",
  partial: "Partial match",
  mismatch: "Mismatch",
  not_found: "Not found on card",
};

export const FIELD_RESULT_TONE: Record<FieldResult, Tone> = {
  match: "success",
  partial: "warning",
  mismatch: "danger",
  not_found: "danger",
};

export type FieldCheck = {
  submitted: string;
  extracted: string | null;
  result: FieldResult;
  /** 0–1 similarity used to pick the result. */
  score: number;
};

export type OcrComparison = {
  fullName: FieldCheck;
  studentNumber: FieldCheck;
  university: FieldCheck;
};

export const COMPARED_FIELDS: { key: keyof OcrComparison; label: string }[] = [
  { key: "fullName", label: "Full name" },
  { key: "studentNumber", label: "Student ID number" },
  { key: "university", label: "University" },
];

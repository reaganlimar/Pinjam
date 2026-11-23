/**
 * Loan (borrowing transaction) status machine. Pure, shared by server and UI.
 *
 *   pending ──approve──▶ approved ──mark_ready──▶ ready_for_pickup ──confirm_pickup──▶ borrowed
 *      │                    │                          │                                 │
 *      ├─reject─▶ rejected  └──cancel──▶ cancelled ◀───┘                          mark_returned
 *      └─cancel─▶ cancelled                                                             ▼
 *                                         completed ◀──confirm_return── return_pending
 *   (the lender may also confirm_return straight from borrowed if the borrower forgot to tap Return)
 */

export const LOAN_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "ready_for_pickup",
  "borrowed",
  "return_pending",
  "completed",
  "cancelled",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export type LoanRole = "borrower" | "lender";

export const LOAN_ACTIONS = [
  "approve",
  "reject",
  "cancel",
  "mark_ready",
  "confirm_pickup",
  "mark_returned",
  "confirm_return",
] as const;
export type LoanAction = (typeof LOAN_ACTIONS)[number];

type Rule = { from: readonly LoanStatus[]; to: LoanStatus; by: readonly LoanRole[] };

const RULES: Record<LoanAction, Rule> = {
  approve: { from: ["pending"], to: "approved", by: ["lender"] },
  reject: { from: ["pending"], to: "rejected", by: ["lender"] },
  cancel: { from: ["pending", "approved", "ready_for_pickup"], to: "cancelled", by: ["borrower", "lender"] },
  mark_ready: { from: ["approved"], to: "ready_for_pickup", by: ["lender"] },
  confirm_pickup: { from: ["ready_for_pickup"], to: "borrowed", by: ["borrower"] },
  mark_returned: { from: ["borrowed"], to: "return_pending", by: ["borrower"] },
  confirm_return: { from: ["borrowed", "return_pending"], to: "completed", by: ["lender"] },
};

/** Lenders may only cancel after approving (a pending request is rejected instead). */
function roleMayCancelFrom(role: LoanRole, from: LoanStatus) {
  return role === "borrower" || from !== "pending";
}

export function canPerform(action: LoanAction, status: LoanStatus, role: LoanRole): boolean {
  const rule = RULES[action];
  if (!rule.from.includes(status) || !rule.by.includes(role)) return false;
  if (action === "cancel") return roleMayCancelFrom(role, status);
  return true;
}

/** Returns the next status, or null if the transition is not allowed. */
export function nextStatus(action: LoanAction, status: LoanStatus, role: LoanRole): LoanStatus | null {
  return canPerform(action, status, role) ? RULES[action].to : null;
}

export function availableActions(status: LoanStatus, role: LoanRole): LoanAction[] {
  return LOAN_ACTIONS.filter((a) => canPerform(a, status, role));
}

/** Statuses that reserve the item for their date range. */
export const RESERVING_STATUSES: readonly LoanStatus[] = [
  "approved",
  "ready_for_pickup",
  "borrowed",
  "return_pending",
];
/** Statuses that are still "in progress" (shown under Active). */
export const OPEN_STATUSES: readonly LoanStatus[] = ["pending", ...RESERVING_STATUSES];
export const CLOSED_STATUSES: readonly LoanStatus[] = ["rejected", "completed", "cancelled"];

export const STATUS_LABEL: Record<LoanStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  ready_for_pickup: "Ready for pickup",
  borrowed: "Borrowed",
  return_pending: "Return pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type BadgeTone = "success" | "warning" | "info" | "neutral" | "danger";

export const STATUS_TONE: Record<LoanStatus, BadgeTone> = {
  pending: "warning",
  approved: "info",
  rejected: "danger",
  ready_for_pickup: "info",
  borrowed: "warning",
  return_pending: "warning",
  completed: "success",
  cancelled: "neutral",
};

export const ACTION_LABEL: Record<LoanAction, string> = {
  approve: "Approve",
  reject: "Decline",
  cancel: "Cancel request",
  mark_ready: "Mark ready for pickup",
  confirm_pickup: "Confirm received",
  mark_returned: "Return",
  confirm_return: "Confirm returned",
};

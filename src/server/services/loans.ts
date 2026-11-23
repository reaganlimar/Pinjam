import "server-only";
import { getDb, nowIso, transaction, type Db, type Row } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { loanRequestSchema, parse } from "../validation";
import { notify } from "./notifications";
import { addDays, formatDay, todayDateOnly } from "@/lib/format";
import {
  availableActions,
  nextStatus,
  RESERVING_STATUSES,
  type LoanAction,
  type LoanRole,
  type LoanStatus,
} from "@/lib/loan-status";

export const MAX_DAYS_AHEAD = 60;
export const RETURN_CONDITIONS = ["same", "damaged", "missing_parts"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

type PartyRef = { id: number; name: string; avatarKey: string | null };

export type LoanView = {
  id: number;
  status: LoanStatus;
  item: { id: number; name: string; imageKey: string | null; pickupPoint: string; deleted: boolean };
  borrower: PartyRef;
  lender: PartyRef;
  startDate: string;
  endDate: string;
  days: number;
  pricePerDay: number;
  feeTotal: number;
  paymentMethod: "none" | "cash" | "transfer";
  feeReceivedAt: string | null;
  note: string | null;
  returnCondition: ReturnCondition | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  pickedUpAt: string | null;
  returnedAt: string | null;
  completedAt: string | null;
};

export type LoanEvent = {
  id: number;
  actorName: string | null;
  fromStatus: LoanStatus | null;
  toStatus: LoanStatus;
  note: string | null;
  createdAt: string;
};

const LOAN_SELECT = `
  SELECT l.*, i.name AS item_name, i.pickup_point, i.deleted_at AS item_deleted,
         (SELECT file_key FROM item_images im WHERE im.item_id = i.id ORDER BY position, id LIMIT 1) AS image_key,
         b.full_name AS borrower_name, b.avatar_key AS borrower_avatar,
         o.full_name AS lender_name, o.avatar_key AS lender_avatar
  FROM loans l
  JOIN items i ON i.id = l.item_id
  JOIN users b ON b.id = l.borrower_id
  JOIN users o ON o.id = l.lender_id`;

function toLoan(r: Row): LoanView {
  const opt = (k: string) => (r[k] as string) ?? null;
  return {
    id: Number(r.id),
    status: r.status as LoanStatus,
    item: {
      id: Number(r.item_id),
      name: String(r.item_name),
      imageKey: opt("image_key"),
      pickupPoint: String(r.pickup_point),
      deleted: r.item_deleted !== null,
    },
    borrower: { id: Number(r.borrower_id), name: String(r.borrower_name), avatarKey: opt("borrower_avatar") },
    lender: { id: Number(r.lender_id), name: String(r.lender_name), avatarKey: opt("lender_avatar") },
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    days: Number(r.days),
    pricePerDay: Number(r.price_per_day),
    feeTotal: Number(r.fee_total),
    paymentMethod: r.payment_method as LoanView["paymentMethod"],
    feeReceivedAt: opt("fee_received_at"),
    note: opt("note"),
    returnCondition: opt("return_condition") as ReturnCondition | null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    approvedAt: opt("approved_at"),
    pickedUpAt: opt("picked_up_at"),
    returnedAt: opt("returned_at"),
    completedAt: opt("completed_at"),
  };
}

const RESERVING_SQL = RESERVING_STATUSES.map((s) => `'${s}'`).join(",");

/**
 * Loans that reserve `itemId` and overlap [start, end). Ranges are treated as half-open
 * so one student can return on the morning another picks up. Items that are still out
 * (borrowed / return pending) are treated as reserved at least until today.
 */
function findOverlapping(db: Db, itemId: number, start: string, end: string, excludeLoanId = 0): Row[] {
  const today = todayDateOnly();
  return db
    .prepare(
      `SELECT id, start_date, end_date, status FROM loans
       WHERE item_id = ? AND id <> ? AND status IN (${RESERVING_SQL})
         AND start_date < ?
         AND (CASE WHEN status IN ('borrowed','return_pending') AND end_date < ? THEN ? ELSE end_date END) > ?`,
    )
    .all(itemId, excludeLoanId, end, today, addDays(today, 1), start) as Row[];
}

function logEvent(db: Db, loanId: number, actorId: number | null, from: LoanStatus | null, to: LoanStatus, note?: string) {
  db.prepare(
    "INSERT INTO loan_events (loan_id, actor_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(loanId, actorId, from, to, note ?? null, nowIso());
}

// ---------------------------------------------------------------- creating a request

export function requestLoan(borrowerId: number, input: unknown): number {
  const data = parse(loanRequestSchema, input);
  return transaction((db) => {
    const item = db
      .prepare("SELECT * FROM items WHERE id = ? AND deleted_at IS NULL")
      .get(data.itemId) as Row | undefined;
    if (!item) throw notFound("That item");
    if (Number(item.owner_id) === borrowerId) throw forbidden("You can't borrow your own item.");
    if (Number(item.is_available) !== 1) throw new AppError("This item isn't available to borrow right now.", "conflict");

    const today = todayDateOnly();
    if (data.startDate < today) {
      throw new AppError("Please check the highlighted fields.", "invalid", { startDate: "Pick a date from today onwards." });
    }
    if (data.startDate > addDays(today, MAX_DAYS_AHEAD)) {
      throw new AppError("Please check the highlighted fields.", "invalid", {
        startDate: `You can book up to ${MAX_DAYS_AHEAD} days ahead.`,
      });
    }
    const maxDays = Number(item.max_days);
    if (data.days > maxDays) {
      throw new AppError("Please check the highlighted fields.", "invalid", {
        days: `The lender allows at most ${maxDays} day${maxDays === 1 ? "" : "s"}.`,
      });
    }

    const duplicate = db
      .prepare(
        `SELECT id FROM loans WHERE item_id = ? AND borrower_id = ? AND status IN ('pending', ${RESERVING_SQL})`,
      )
      .get(data.itemId, borrowerId) as Row | undefined;
    if (duplicate) {
      throw new AppError("You already have an open request for this item.", "conflict");
    }

    const endDate = addDays(data.startDate, data.days);
    const clash = findOverlapping(db, data.itemId, data.startDate, endDate);
    if (clash.length) {
      const c = clash[0];
      throw new AppError(
        `This item is already booked from ${formatDay(String(c.start_date))} to ${formatDay(String(c.end_date))}. Try other dates.`,
        "conflict",
      );
    }

    const pricePerDay = Number(item.price_per_day);
    const feeTotal = pricePerDay * data.days;
    let paymentMethod = data.paymentMethod;
    if (feeTotal === 0) paymentMethod = "none";
    else if (paymentMethod === "none") {
      throw new AppError("Please check the highlighted fields.", "invalid", {
        paymentMethod: "Choose how you'll pay the lender.",
      });
    }

    const now = nowIso();
    const { id } = db
      .prepare(
        `INSERT INTO loans (item_id, borrower_id, lender_id, start_date, end_date, days, price_per_day, fee_total,
                            payment_method, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING id`,
      )
      .get(
        data.itemId,
        borrowerId,
        Number(item.owner_id),
        data.startDate,
        endDate,
        data.days,
        pricePerDay,
        feeTotal,
        paymentMethod,
        data.note,
        now,
        now,
      ) as { id: number };
    logEvent(db, Number(id), borrowerId, null, "pending");

    const borrower = db.prepare("SELECT full_name FROM users WHERE id = ?").get(borrowerId) as Row;
    notify(db, Number(item.owner_id), {
      type: "loan_requested",
      title: `${borrower.full_name} requested your ${item.name}`,
      body: "Approve or decline",
      link: `/requests`,
    });
    return Number(id);
  });
}

// ---------------------------------------------------------------- status transitions

function roleOf(loan: Row, userId: number): LoanRole | null {
  if (Number(loan.borrower_id) === userId) return "borrower";
  if (Number(loan.lender_id) === userId) return "lender";
  return null;
}

export function transitionLoan(
  loanId: number,
  actorId: number,
  action: LoanAction,
  opts: { returnCondition?: ReturnCondition; note?: string } = {},
): LoanStatus {
  return transaction((db) => {
    const loan = db
      .prepare("SELECT l.*, i.name AS item_name, i.pickup_point, i.deleted_at AS item_deleted FROM loans l JOIN items i ON i.id = l.item_id WHERE l.id = ?")
      .get(loanId) as Row | undefined;
    if (!loan) throw notFound("That request");
    const role = roleOf(loan, actorId);
    if (!role) throw forbidden();
    const from = loan.status as LoanStatus;
    const to = nextStatus(action, from, role);
    if (!to) {
      throw new AppError("This request has changed since you opened it. Refresh to see its current status.", "conflict");
    }

    const now = nowIso();
    const itemName = String(loan.item_name);
    const borrowerId = Number(loan.borrower_id);
    const lenderId = Number(loan.lender_id);
    const actor = db.prepare("SELECT full_name FROM users WHERE id = ?").get(actorId) as Row;
    const actorName = String(actor.full_name);
    const link = `/loans/${loanId}`;

    if (action === "approve") {
      if (loan.item_deleted !== null) throw new AppError("This listing was removed.", "conflict");
      const clash = findOverlapping(db, Number(loan.item_id), String(loan.start_date), String(loan.end_date), loanId);
      if (clash.length) {
        throw new AppError("You've already approved another request for these dates.", "conflict");
      }
    }

    const stamp: Partial<Record<LoanStatus, string>> = {
      approved: "approved_at",
      borrowed: "picked_up_at",
      return_pending: "returned_at",
      completed: "completed_at",
    };
    const sets = ["status = :to", "updated_at = :now"];
    const params: Record<string, string | number | null> = { to, now, id: loanId };
    if (stamp[to]) sets.push(`${stamp[to]} = :now`);
    if (action === "confirm_return") {
      // If the lender confirms without the borrower tapping Return, record the return time now.
      if (from === "borrowed") sets.push("returned_at = :now");
      sets.push("return_condition = :cond");
      params.cond = opts.returnCondition ?? "same";
    }
    db.prepare(`UPDATE loans SET ${sets.join(", ")} WHERE id = :id`).run(params);
    logEvent(db, loanId, actorId, from, to, opts.note);

    switch (action) {
      case "approve": {
        notify(db, borrowerId, {
          type: "loan_approved",
          title: `Your request for ${itemName} was approved`,
          body: "The lender will let you know when it's ready for pickup.",
          link,
        });
        // Decline other pending requests that now clash with this approved loan.
        const others = db
          .prepare(
            `SELECT id, borrower_id FROM loans WHERE item_id = ? AND id <> ? AND status = 'pending'
             AND start_date < ? AND end_date > ?`,
          )
          .all(Number(loan.item_id), loanId, String(loan.end_date), String(loan.start_date)) as Row[];
        for (const o of others) {
          db.prepare("UPDATE loans SET status = 'rejected', updated_at = ? WHERE id = ?").run(now, Number(o.id));
          logEvent(db, Number(o.id), actorId, "pending", "rejected", "Dates taken by another approved request");
          notify(db, Number(o.borrower_id), {
            type: "loan_rejected",
            title: `Your request for ${itemName} was declined`,
            body: "Those dates were given to another student. Try different dates.",
            link: `/loans/${o.id}`,
          });
        }
        break;
      }
      case "reject":
        notify(db, borrowerId, {
          type: "loan_rejected",
          title: `Your request for ${itemName} was declined`,
          body: "You can look for a similar item or try other dates.",
          link,
        });
        break;
      case "cancel":
        notify(db, role === "borrower" ? lenderId : borrowerId, {
          type: "loan_cancelled",
          title: `${actorName} cancelled the request for ${itemName}`,
          link,
        });
        break;
      case "mark_ready":
        notify(db, borrowerId, {
          type: "loan_ready",
          title: `${itemName} is ready for pickup`,
          body: `Pick it up at ${loan.pickup_point} on ${formatDay(String(loan.start_date))}.`,
          link,
        });
        break;
      case "confirm_pickup":
        notify(db, lenderId, {
          type: "loan_picked_up",
          title: `${actorName} picked up your ${itemName}`,
          body: `Due back ${formatDay(String(loan.end_date))}.`,
          link,
        });
        break;
      case "mark_returned":
        notify(db, lenderId, {
          type: "loan_return_marked",
          title: `${actorName} returned your ${itemName}`,
          body: "Confirm you have it back.",
          link,
        });
        break;
      case "confirm_return": {
        const onTime = todayDateOnly() <= String(loan.end_date);
        notify(db, borrowerId, {
          type: "loan_completed",
          title: `${itemName} returned. Thank you!`,
          body: onTime ? "Returned on time. Rate the lender to finish." : "Transaction completed. Rate the lender to finish.",
          link,
        });
        break;
      }
    }
    return to;
  });
}

/** Lender records that the agreed fee was paid (no money moves through Pinjam). */
export function markFeeReceived(loanId: number, lenderId: number) {
  const db = getDb();
  const loan = db.prepare("SELECT * FROM loans WHERE id = ?").get(loanId) as Row | undefined;
  if (!loan) throw notFound("That loan");
  if (Number(loan.lender_id) !== lenderId) throw forbidden();
  if (Number(loan.fee_total) === 0) throw new AppError("This loan is free.", "invalid");
  if (!["ready_for_pickup", "borrowed", "return_pending", "completed"].includes(String(loan.status))) {
    throw new AppError("You can record payment once the item is ready for pickup.", "conflict");
  }
  db.prepare("UPDATE loans SET fee_received_at = COALESCE(fee_received_at, ?), updated_at = ? WHERE id = ?").run(
    nowIso(),
    nowIso(),
    loanId,
  );
}

// ---------------------------------------------------------------- queries

export function getLoanForUser(loanId: number, userId: number): { loan: LoanView; role: LoanRole; events: LoanEvent[] } {
  const db = getDb();
  const row = db.prepare(`${LOAN_SELECT} WHERE l.id = ?`).get(loanId) as Row | undefined;
  if (!row) throw notFound("That loan");
  const role = roleOf(row, userId);
  if (!role) throw notFound("That loan");
  const events = (
    db
      .prepare(
        `SELECT e.*, u.full_name AS actor_name FROM loan_events e LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.loan_id = ? ORDER BY e.id`,
      )
      .all(loanId) as Row[]
  ).map((e) => ({
    id: Number(e.id),
    actorName: (e.actor_name as string) ?? null,
    fromStatus: (e.from_status as LoanStatus) ?? null,
    toStatus: e.to_status as LoanStatus,
    note: (e.note as string) ?? null,
    createdAt: String(e.created_at),
  }));
  return { loan: toLoan(row), role, events };
}

function list(where: string, ...args: (string | number)[]): LoanView[] {
  return (getDb().prepare(`${LOAN_SELECT} WHERE ${where}`).all(...args) as Row[]).map(toLoan);
}

/** The viewer's unfinished request/loan for an item, if any. */
export function openLoanForItem(itemId: number, borrowerId: number): LoanView | null {
  return (
    list(
      `l.item_id = ? AND l.borrower_id = ? AND l.status IN ('pending', ${RESERVING_SQL}) ORDER BY l.id DESC LIMIT 1`,
      itemId,
      borrowerId,
    )[0] ?? null
  );
}

export function pendingRequestCount(lenderId: number): number {
  const r = getDb().prepare("SELECT COUNT(*) n FROM loans WHERE lender_id = ? AND status = 'pending'").get(lenderId) as Row;
  return Number(r.n);
}

/** Requests the lender needs to see: pending first, then approved / in-progress ones. */
export function receivedRequests(lenderId: number): LoanView[] {
  return list(
    `l.lender_id = ? AND l.status IN ('pending', ${RESERVING_SQL})
     ORDER BY CASE l.status WHEN 'pending' THEN 0 WHEN 'return_pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, l.start_date`,
    lenderId,
  );
}

/** Everything the student has asked to borrow that hasn't finished yet, plus recent outcomes. */
export function sentRequests(borrowerId: number): LoanView[] {
  return list(
    `l.borrower_id = ? AND (l.status = 'pending' OR l.status = 'approved' OR l.status = 'ready_for_pickup'
       OR (l.status IN ('rejected','cancelled') AND l.updated_at >= ?))
     ORDER BY l.created_at DESC`,
    borrowerId,
    new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  );
}

/** Borrower's loans that are approved or in progress (My Loans → Active). */
export function activeBorrows(borrowerId: number): LoanView[] {
  return list(`l.borrower_id = ? AND l.status IN (${RESERVING_SQL}) ORDER BY l.end_date`, borrowerId);
}

/** Lender's items currently out or being handed over. */
export function activeLends(lenderId: number): LoanView[] {
  return list(`l.lender_id = ? AND l.status IN (${RESERVING_SQL}) ORDER BY l.end_date`, lenderId);
}

/** Closed loans on either side (My Loans → History, profile history). */
export function loanHistory(userId: number, side: "borrower" | "lender" | "both" = "both"): LoanView[] {
  const who =
    side === "borrower" ? "l.borrower_id = ?" : side === "lender" ? "l.lender_id = ?" : "(l.borrower_id = ? OR l.lender_id = ?)";
  const args = side === "both" ? [userId, userId] : [userId];
  return list(`${who} AND l.status IN ('completed','rejected','cancelled') ORDER BY l.updated_at DESC LIMIT 100`, ...args);
}

export { availableActions };

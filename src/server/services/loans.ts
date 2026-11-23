import "server-only";
import { getDb, join, PG, pgCode, pgConstraint, raw, sql, transaction, type Database, type Row } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { loanRequestSchema, parse } from "../validation";
import { notify } from "./notifications";
import { lockItem } from "./items";
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

const LOAN_SELECT = sql`
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

const RESERVING_SQL = raw(RESERVING_STATUSES.map((s) => `'${s}'`).join(","));

/**
 * Loans that reserve `itemId` and overlap [start, end). Ranges are half-open so one
 * student can return on the morning another picks up. Items that are still out
 * (borrowed / return pending) are treated as reserved at least until today.
 * (The loans_no_overlap constraint enforces the date-range part in the database too.)
 */
async function findOverlapping(db: Database, itemId: number, start: string, end: string, excludeLoanId = 0) {
  const today = todayDateOnly();
  return db.many<{ id: number; start_date: string; end_date: string }>(sql`
    SELECT id, start_date, end_date FROM loans
    WHERE item_id = ${itemId} AND id <> ${excludeLoanId} AND status IN (${RESERVING_SQL})
      AND start_date < ${end}::date
      AND (CASE WHEN status IN ('borrowed', 'return_pending') AND end_date < ${today}::date
                THEN ${addDays(today, 1)}::date ELSE end_date END) > ${start}::date`);
}

async function logEvent(db: Database, loanId: number, actorId: number | null, from: LoanStatus | null, to: LoanStatus, note?: string) {
  await db.run(sql`
    INSERT INTO loan_events (loan_id, actor_id, from_status, to_status, note)
    VALUES (${loanId}, ${actorId}, ${from}, ${to}, ${note ?? null})`);
}

function invalid(field: string, message: string) {
  return new AppError("Please check the highlighted fields.", "invalid", { [field]: message });
}

// ---------------------------------------------------------------- creating a request

export async function requestLoan(borrowerId: number, input: unknown): Promise<number> {
  const data = parse(loanRequestSchema, input);
  try {
    return await transaction(async (db) => {
      // Lock the item so concurrent requests/approvals for it run one at a time.
      const item = await lockItem(db, data.itemId);
      if (Number(item.owner_id) === borrowerId) throw forbidden("You can't borrow your own item.");
      if (item.is_available !== true) throw new AppError("This item isn't available to borrow right now.", "conflict");

      const today = todayDateOnly();
      if (data.startDate < today) throw invalid("startDate", "Pick a date from today onwards.");
      if (data.startDate > addDays(today, MAX_DAYS_AHEAD)) {
        throw invalid("startDate", `You can book up to ${MAX_DAYS_AHEAD} days ahead.`);
      }
      const maxDays = Number(item.max_days);
      if (data.days > maxDays) throw invalid("days", `The lender allows at most ${maxDays} day${maxDays === 1 ? "" : "s"}.`);

      const duplicate = await db.maybe(sql`
        SELECT id FROM loans WHERE item_id = ${data.itemId} AND borrower_id = ${borrowerId}
          AND status IN ('pending', ${RESERVING_SQL})`);
      if (duplicate) throw new AppError("You already have an open request for this item.", "conflict");

      const endDate = addDays(data.startDate, data.days);
      const clash = await findOverlapping(db, data.itemId, data.startDate, endDate);
      if (clash.length) {
        throw new AppError(
          `This item is already booked from ${formatDay(clash[0].start_date)} to ${formatDay(clash[0].end_date)}. Try other dates.`,
          "conflict",
        );
      }

      const pricePerDay = Number(item.price_per_day);
      const feeTotal = pricePerDay * data.days;
      let paymentMethod = data.paymentMethod;
      if (feeTotal === 0) paymentMethod = "none";
      else if (paymentMethod === "none") throw invalid("paymentMethod", "Choose how you'll pay the lender.");

      const { id } = await db.one<{ id: number }>(sql`
        INSERT INTO loans (item_id, borrower_id, lender_id, start_date, end_date, days, price_per_day, fee_total,
                           payment_method, note, status)
        VALUES (${data.itemId}, ${borrowerId}, ${Number(item.owner_id)}, ${data.startDate}, ${endDate}, ${data.days},
                ${pricePerDay}, ${feeTotal}, ${paymentMethod}, ${data.note}, 'pending')
        RETURNING id`);
      await logEvent(db, id, borrowerId, null, "pending");

      const borrower = await db.one<{ full_name: string }>(sql`SELECT full_name FROM users WHERE id = ${borrowerId}`);
      await notify(db, Number(item.owner_id), {
        type: "loan_requested",
        title: `${borrower.full_name} requested your ${item.name}`,
        body: "Approve or decline",
        link: "/requests",
      });
      return Number(id);
    });
  } catch (err) {
    if (pgCode(err) === PG.uniqueViolation && pgConstraint(err) === "loans_one_open_per_borrower") {
      throw new AppError("You already have an open request for this item.", "conflict");
    }
    throw err;
  }
}

// ---------------------------------------------------------------- status transitions

function roleOf(loan: Row, userId: number): LoanRole | null {
  if (Number(loan.borrower_id) === userId) return "borrower";
  if (Number(loan.lender_id) === userId) return "lender";
  return null;
}

const STAMP: Partial<Record<LoanStatus, string>> = {
  approved: "approved_at",
  borrowed: "picked_up_at",
  return_pending: "returned_at",
  completed: "completed_at",
};

export async function transitionLoan(
  loanId: number,
  actorId: number,
  action: LoanAction,
  opts: { returnCondition?: ReturnCondition; note?: string } = {},
): Promise<LoanStatus> {
  try {
    return await transaction((db) => runTransition(db, loanId, actorId, action, opts));
  } catch (err) {
    if (pgCode(err) === PG.exclusionViolation) {
      throw new AppError("You've already approved another request for these dates.", "conflict");
    }
    throw err;
  }
}

async function runTransition(
  db: Database,
  loanId: number,
  actorId: number,
  action: LoanAction,
  opts: { returnCondition?: ReturnCondition; note?: string },
): Promise<LoanStatus> {
  const head = await db.maybe<{ item_id: number }>(sql`SELECT item_id FROM loans WHERE id = ${loanId}`);
  if (!head) throw notFound("That request");
  // Lock the item first (same order as requestLoan) so approvals can't race.
  await db.run(sql`SELECT id FROM items WHERE id = ${head.item_id} FOR UPDATE`);
  const loan = await db.one(sql`
    SELECT l.*, i.name AS item_name, i.pickup_point, i.deleted_at AS item_deleted
    FROM loans l JOIN items i ON i.id = l.item_id WHERE l.id = ${loanId} FOR UPDATE OF l`);

  const role = roleOf(loan, actorId);
  if (!role) throw forbidden();
  const from = loan.status as LoanStatus;
  const to = nextStatus(action, from, role);
  if (!to) throw new AppError("This request has changed since you opened it. Refresh to see its current status.", "conflict");

  const itemName = String(loan.item_name);
  const borrowerId = Number(loan.borrower_id);
  const lenderId = Number(loan.lender_id);
  const actor = await db.one<{ full_name: string }>(sql`SELECT full_name FROM users WHERE id = ${actorId}`);
  const link = `/loans/${loanId}`;

  if (action === "approve") {
    if (loan.item_deleted !== null) throw new AppError("This listing was removed.", "conflict");
    const clash = await findOverlapping(db, Number(loan.item_id), String(loan.start_date), String(loan.end_date), loanId);
    if (clash.length) throw new AppError("You've already approved another request for these dates.", "conflict");
  }

  const sets = [sql`status = ${to}`, sql`updated_at = now()`];
  if (STAMP[to]) sets.push(sql`${raw(STAMP[to]!)} = now()`);
  if (action === "confirm_return") {
    // If the lender confirms without the borrower tapping Return, record the return time now.
    if (from === "borrowed") sets.push(sql`returned_at = now()`);
    sets.push(sql`return_condition = ${opts.returnCondition ?? "same"}`);
  }
  await db.run(sql`UPDATE loans SET ${join(sets, ", ")} WHERE id = ${loanId}`);
  await logEvent(db, loanId, actorId, from, to, opts.note);

  switch (action) {
    case "approve": {
      await notify(db, borrowerId, {
        type: "loan_approved",
        title: `Your request for ${itemName} was approved`,
        body: "The lender will let you know when it's ready for pickup.",
        link,
      });
      // Decline other pending requests that now clash with this approved loan.
      const others = await db.many<{ id: number; borrower_id: number }>(sql`
        UPDATE loans SET status = 'rejected', updated_at = now()
        WHERE item_id = ${Number(loan.item_id)} AND id <> ${loanId} AND status = 'pending'
          AND start_date < ${String(loan.end_date)}::date AND end_date > ${String(loan.start_date)}::date
        RETURNING id, borrower_id`);
      for (const o of others) {
        await logEvent(db, o.id, actorId, "pending", "rejected", "Dates taken by another approved request");
        await notify(db, Number(o.borrower_id), {
          type: "loan_rejected",
          title: `Your request for ${itemName} was declined`,
          body: "Those dates were given to another student. Try different dates.",
          link: `/loans/${o.id}`,
        });
      }
      break;
    }
    case "reject":
      await notify(db, borrowerId, {
        type: "loan_rejected",
        title: `Your request for ${itemName} was declined`,
        body: "You can look for a similar item or try other dates.",
        link,
      });
      break;
    case "cancel":
      await notify(db, role === "borrower" ? lenderId : borrowerId, {
        type: "loan_cancelled",
        title: `${actor.full_name} cancelled the request for ${itemName}`,
        link,
      });
      break;
    case "mark_ready":
      await notify(db, borrowerId, {
        type: "loan_ready",
        title: `${itemName} is ready for pickup`,
        body: `Pick it up at ${loan.pickup_point} on ${formatDay(String(loan.start_date))}.`,
        link,
      });
      break;
    case "confirm_pickup":
      await notify(db, lenderId, {
        type: "loan_picked_up",
        title: `${actor.full_name} picked up your ${itemName}`,
        body: `Due back ${formatDay(String(loan.end_date))}.`,
        link,
      });
      break;
    case "mark_returned":
      await notify(db, lenderId, {
        type: "loan_return_marked",
        title: `${actor.full_name} returned your ${itemName}`,
        body: "Confirm you have it back.",
        link,
      });
      break;
    case "confirm_return": {
      const onTime = todayDateOnly() <= String(loan.end_date);
      await notify(db, borrowerId, {
        type: "loan_completed",
        title: `${itemName} returned. Thank you!`,
        body: onTime ? "Returned on time. Rate the lender to finish." : "Transaction completed. Rate the lender to finish.",
        link,
      });
      break;
    }
  }
  return to;
}

/** Lender records that the agreed fee was paid (no money moves through Pinjam). */
export async function markFeeReceived(loanId: number, lenderId: number) {
  const db = getDb();
  const loan = await db.maybe(sql`SELECT * FROM loans WHERE id = ${loanId}`);
  if (!loan) throw notFound("That loan");
  if (Number(loan.lender_id) !== lenderId) throw forbidden();
  if (Number(loan.fee_total) === 0) throw new AppError("This loan is free.", "invalid");
  if (!["ready_for_pickup", "borrowed", "return_pending", "completed"].includes(String(loan.status))) {
    throw new AppError("You can record payment once the item is ready for pickup.", "conflict");
  }
  await db.run(
    sql`UPDATE loans SET fee_received_at = COALESCE(fee_received_at, now()), updated_at = now() WHERE id = ${loanId}`,
  );
}

// ---------------------------------------------------------------- queries

export async function getLoanForUser(
  loanId: number,
  userId: number,
): Promise<{ loan: LoanView; role: LoanRole; events: LoanEvent[] }> {
  const db = getDb();
  const row = await db.maybe(sql`${LOAN_SELECT} WHERE l.id = ${loanId}`);
  if (!row) throw notFound("That loan");
  const role = roleOf(row, userId);
  if (!role) throw notFound("That loan");
  const events = await db.many(sql`
    SELECT e.*, u.full_name AS actor_name FROM loan_events e LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.loan_id = ${loanId} ORDER BY e.id`);
  return {
    loan: toLoan(row),
    role,
    events: events.map((e) => ({
      id: Number(e.id),
      actorName: (e.actor_name as string) ?? null,
      fromStatus: (e.from_status as LoanStatus) ?? null,
      toStatus: e.to_status as LoanStatus,
      note: (e.note as string) ?? null,
      createdAt: String(e.created_at),
    })),
  };
}

async function list(where: ReturnType<typeof sql>): Promise<LoanView[]> {
  return (await getDb().many(sql`${LOAN_SELECT} WHERE ${where}`)).map(toLoan);
}

/** The viewer's unfinished request/loan for an item, if any. */
export async function openLoanForItem(itemId: number, borrowerId: number): Promise<LoanView | null> {
  const rows = await list(sql`
    l.item_id = ${itemId} AND l.borrower_id = ${borrowerId} AND l.status IN ('pending', ${RESERVING_SQL})
    ORDER BY l.id DESC LIMIT 1`);
  return rows[0] ?? null;
}

export async function pendingRequestCount(lenderId: number): Promise<number> {
  const r = await getDb().one<{ n: number }>(
    sql`SELECT count(*) AS n FROM loans WHERE lender_id = ${lenderId} AND status = 'pending'`,
  );
  return Number(r.n);
}

/** Requests the lender needs to see: pending first, then approved / in-progress ones. */
export function receivedRequests(lenderId: number): Promise<LoanView[]> {
  return list(sql`
    l.lender_id = ${lenderId} AND l.status IN ('pending', ${RESERVING_SQL})
    ORDER BY CASE l.status WHEN 'pending' THEN 0 WHEN 'return_pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
             l.start_date`);
}

/** Everything the student has asked to borrow that hasn't started yet, plus recent outcomes. */
export function sentRequests(borrowerId: number): Promise<LoanView[]> {
  return list(sql`
    l.borrower_id = ${borrowerId} AND (l.status IN ('pending', 'approved', 'ready_for_pickup')
      OR (l.status IN ('rejected', 'cancelled') AND l.updated_at >= now() - interval '14 days'))
    ORDER BY l.created_at DESC`);
}

/** Borrower's loans that are approved or in progress (My Loans → Active). */
export function activeBorrows(borrowerId: number): Promise<LoanView[]> {
  return list(sql`l.borrower_id = ${borrowerId} AND l.status IN (${RESERVING_SQL}) ORDER BY l.end_date`);
}

/** Lender's items currently out or being handed over. */
export function activeLends(lenderId: number): Promise<LoanView[]> {
  return list(sql`l.lender_id = ${lenderId} AND l.status IN (${RESERVING_SQL}) ORDER BY l.end_date`);
}

/** Closed loans on either side (My Loans → History, profile history). */
export function loanHistory(userId: number, side: "borrower" | "lender" | "both" = "both"): Promise<LoanView[]> {
  const who =
    side === "borrower"
      ? sql`l.borrower_id = ${userId}`
      : side === "lender"
        ? sql`l.lender_id = ${userId}`
        : sql`(l.borrower_id = ${userId} OR l.lender_id = ${userId})`;
  return list(sql`${who} AND l.status IN ('completed', 'rejected', 'cancelled') ORDER BY l.updated_at DESC LIMIT 100`);
}

export { availableActions };

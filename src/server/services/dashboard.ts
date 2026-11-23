import "server-only";
import { getDb, sql } from "../db";
import { activeBorrows, activeLends, receivedRequests, sentRequests } from "./loans";
import { recentItems } from "./items";
import type { LoanStatus } from "@/lib/loan-status";

export type ActivityEntry = {
  loanId: number;
  itemName: string;
  actorName: string | null;
  actorIsMe: boolean;
  toStatus: LoanStatus;
  createdAt: string;
};

async function recentActivity(userId: number, limit = 8): Promise<ActivityEntry[]> {
  const rows = await getDb().many(sql`
    SELECT e.loan_id, e.to_status, e.created_at, e.actor_id, u.full_name AS actor_name, i.name AS item_name
    FROM loan_events e
    JOIN loans l ON l.id = e.loan_id
    JOIN items i ON i.id = l.item_id
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE l.borrower_id = ${userId} OR l.lender_id = ${userId}
    ORDER BY e.id DESC LIMIT ${limit}`);
  return rows.map((r) => ({
    loanId: Number(r.loan_id),
    itemName: String(r.item_name),
    actorName: (r.actor_name as string) ?? null,
    actorIsMe: Number(r.actor_id) === userId,
    toStatus: r.to_status as LoanStatus,
    createdAt: String(r.created_at),
  }));
}

export async function getDashboard(userId: number) {
  const [received, borrowing, lends, sent, items, activity] = await Promise.all([
    receivedRequests(userId),
    activeBorrows(userId),
    activeLends(userId),
    sentRequests(userId),
    recentItems(userId, 4),
    recentActivity(userId),
  ]);
  return {
    needsAction: received.filter((l) => ["pending", "approved", "return_pending"].includes(l.status)),
    borrowing,
    lentOut: lends.filter((l) => ["borrowed", "return_pending", "ready_for_pickup"].includes(l.status)),
    waiting: sent.filter((l) => l.status === "pending"),
    recentItems: items,
    activity,
  };
}

import "server-only";
import { getDb, type Row } from "../db";
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

function recentActivity(userId: number, limit = 8): ActivityEntry[] {
  return (
    getDb()
      .prepare(
        `SELECT e.loan_id, e.to_status, e.created_at, e.actor_id, u.full_name AS actor_name, i.name AS item_name
         FROM loan_events e
         JOIN loans l ON l.id = e.loan_id
         JOIN items i ON i.id = l.item_id
         LEFT JOIN users u ON u.id = e.actor_id
         WHERE l.borrower_id = ? OR l.lender_id = ?
         ORDER BY e.id DESC LIMIT ?`,
      )
      .all(userId, userId, limit) as Row[]
  ).map((r) => ({
    loanId: Number(r.loan_id),
    itemName: String(r.item_name),
    actorName: (r.actor_name as string) ?? null,
    actorIsMe: Number(r.actor_id) === userId,
    toStatus: r.to_status as LoanStatus,
    createdAt: String(r.created_at),
  }));
}

export function getDashboard(userId: number) {
  const received = receivedRequests(userId);
  return {
    needsAction: received.filter((l) => ["pending", "approved", "return_pending"].includes(l.status)),
    borrowing: activeBorrows(userId),
    lentOut: activeLends(userId).filter((l) => ["borrowed", "return_pending", "ready_for_pickup"].includes(l.status)),
    waiting: sentRequests(userId).filter((l) => l.status === "pending"),
    recentItems: recentItems(userId, 4),
    activity: recentActivity(userId),
  };
}

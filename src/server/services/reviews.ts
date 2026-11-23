import "server-only";
import { getDb, nowIso, transaction, type Row } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { parse, reviewSchema } from "../validation";
import { notify } from "./notifications";

export type Review = {
  id: number;
  rating: number;
  comment: string | null;
  reviewerName: string;
  itemName: string;
  createdAt: string;
};

export function createReview(reviewerId: number, input: unknown) {
  const data = parse(reviewSchema, input);
  transaction((db) => {
    const loan = db
      .prepare("SELECT l.*, i.name AS item_name FROM loans l JOIN items i ON i.id = l.item_id WHERE l.id = ?")
      .get(data.loanId) as Row | undefined;
    if (!loan) throw notFound("That loan");
    const isBorrower = Number(loan.borrower_id) === reviewerId;
    const isLender = Number(loan.lender_id) === reviewerId;
    if (!isBorrower && !isLender) throw forbidden();
    if (loan.status !== "completed") throw new AppError("You can leave a review once the loan is completed.", "conflict");
    const revieweeId = isBorrower ? Number(loan.lender_id) : Number(loan.borrower_id);
    const exists = db
      .prepare("SELECT 1 FROM reviews WHERE loan_id = ? AND reviewer_id = ?")
      .get(data.loanId, reviewerId);
    if (exists) throw new AppError("You've already reviewed this loan.", "conflict");
    db.prepare(
      "INSERT INTO reviews (loan_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(data.loanId, reviewerId, revieweeId, data.rating, data.comment, nowIso());
    const reviewer = db.prepare("SELECT full_name FROM users WHERE id = ?").get(reviewerId) as Row;
    notify(db, revieweeId, {
      type: "review",
      title: `${reviewer.full_name} rated you ${data.rating}★`,
      body: `For ${loan.item_name}`,
      link: `/users/${revieweeId}`,
    });
  });
}

export function hasReviewed(loanId: number, reviewerId: number): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM reviews WHERE loan_id = ? AND reviewer_id = ?").get(loanId, reviewerId));
}

export function reviewsFor(userId: number, limit = 20): Review[] {
  return (
    getDb()
      .prepare(
        `SELECT r.*, u.full_name AS reviewer_name, i.name AS item_name FROM reviews r
         JOIN users u ON u.id = r.reviewer_id JOIN loans l ON l.id = r.loan_id JOIN items i ON i.id = l.item_id
         WHERE r.reviewee_id = ? ORDER BY r.id DESC LIMIT ?`,
      )
      .all(userId, limit) as Row[]
  ).map((r) => ({
    id: Number(r.id),
    rating: Number(r.rating),
    comment: (r.comment as string) ?? null,
    reviewerName: String(r.reviewer_name),
    itemName: String(r.item_name),
    createdAt: String(r.created_at),
  }));
}

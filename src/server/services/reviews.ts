import "server-only";
import { getDb, PG, pgCode, sql, transaction } from "../db";
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

const alreadyReviewed = () => new AppError("You've already reviewed this loan.", "conflict");

export async function createReview(reviewerId: number, input: unknown) {
  const data = parse(reviewSchema, input);
  try {
    await transaction(async (db) => {
      const loan = await db.maybe(sql`
        SELECT l.*, i.name AS item_name FROM loans l JOIN items i ON i.id = l.item_id WHERE l.id = ${data.loanId}`);
      if (!loan) throw notFound("That loan");
      const isBorrower = Number(loan.borrower_id) === reviewerId;
      const isLender = Number(loan.lender_id) === reviewerId;
      if (!isBorrower && !isLender) throw forbidden();
      if (loan.status !== "completed") throw new AppError("You can leave a review once the loan is completed.", "conflict");
      const revieweeId = isBorrower ? Number(loan.lender_id) : Number(loan.borrower_id);
      if (await db.maybe(sql`SELECT 1 FROM reviews WHERE loan_id = ${data.loanId} AND reviewer_id = ${reviewerId}`)) {
        throw alreadyReviewed();
      }
      await db.run(sql`
        INSERT INTO reviews (loan_id, reviewer_id, reviewee_id, rating, comment)
        VALUES (${data.loanId}, ${reviewerId}, ${revieweeId}, ${data.rating}, ${data.comment})`);
      const reviewer = await db.one<{ full_name: string }>(sql`SELECT full_name FROM users WHERE id = ${reviewerId}`);
      await notify(db, revieweeId, {
        type: "review",
        title: `${reviewer.full_name} rated you ${data.rating}★`,
        body: `For ${loan.item_name}`,
        link: `/users/${revieweeId}`,
      });
    });
  } catch (err) {
    if (pgCode(err) === PG.uniqueViolation) throw alreadyReviewed();
    throw err;
  }
}

export async function hasReviewed(loanId: number, reviewerId: number): Promise<boolean> {
  return Boolean(
    await getDb().maybe(sql`SELECT 1 FROM reviews WHERE loan_id = ${loanId} AND reviewer_id = ${reviewerId}`),
  );
}

export async function reviewsFor(userId: number, limit = 20): Promise<Review[]> {
  const rows = await getDb().many(sql`
    SELECT r.*, u.full_name AS reviewer_name, i.name AS item_name FROM reviews r
    JOIN users u ON u.id = r.reviewer_id JOIN loans l ON l.id = r.loan_id JOIN items i ON i.id = l.item_id
    WHERE r.reviewee_id = ${userId} ORDER BY r.id DESC LIMIT ${limit}`);
  return rows.map((r) => ({
    id: Number(r.id),
    rating: Number(r.rating),
    comment: (r.comment as string) ?? null,
    reviewerName: String(r.reviewer_name),
    itemName: String(r.item_name),
    createdAt: String(r.created_at),
  }));
}

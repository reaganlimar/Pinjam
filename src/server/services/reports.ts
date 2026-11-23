import "server-only";
import { getDb, PG, pgCode, sql } from "../db";
import { AppError, notFound } from "../errors";
import { parse, reportSchema } from "../validation";

export const REPORT_REASONS = {
  misleading: "Photos or description are misleading",
  prohibited: "Item isn't allowed on campus",
  not_owner: "Lister doesn't seem to own it",
  unsafe: "Item is unsafe or damaged",
  spam: "Spam or duplicate listing",
  other: "Something else",
} as const;

const alreadyReported = () => new AppError("You've already reported this listing. Thanks, we'll take a look.", "conflict");

/**
 * Stores a report for the Pinjam team to review. There is no moderator dashboard yet:
 * reports are kept in the `reports` table (status 'open').
 */
export async function reportItem(reporterId: number, input: unknown) {
  const data = parse(reportSchema, input);
  const db = getDb();
  const item = await db.maybe<{ owner_id: number }>(sql`SELECT owner_id FROM items WHERE id = ${data.itemId}`);
  if (!item) throw notFound("That item");
  if (Number(item.owner_id) === reporterId) throw new AppError("You can't report your own listing.");
  try {
    await db.run(sql`
      INSERT INTO reports (reporter_id, item_id, reason, details)
      VALUES (${reporterId}, ${data.itemId}, ${data.reason}, ${data.details})`);
  } catch (err) {
    if (pgCode(err) === PG.uniqueViolation) throw alreadyReported();
    throw err;
  }
}

export async function hasReported(reporterId: number, itemId: number): Promise<boolean> {
  return Boolean(await getDb().maybe(sql`SELECT 1 FROM reports WHERE reporter_id = ${reporterId} AND item_id = ${itemId}`));
}

import "server-only";
import { getDb, nowIso, type Row } from "../db";
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

/**
 * Stores a report for the Pinjam team to review. There is no moderator dashboard yet:
 * reports are kept in the `reports` table (status 'open').
 */
export function reportItem(reporterId: number, input: unknown) {
  const data = parse(reportSchema, input);
  const db = getDb();
  const item = db.prepare("SELECT owner_id FROM items WHERE id = ?").get(data.itemId) as Row | undefined;
  if (!item) throw notFound("That item");
  if (Number(item.owner_id) === reporterId) throw new AppError("You can't report your own listing.");
  const existing = db.prepare("SELECT 1 FROM reports WHERE reporter_id = ? AND item_id = ?").get(reporterId, data.itemId);
  if (existing) throw new AppError("You've already reported this listing. Thanks, we'll take a look.", "conflict");
  db.prepare(
    "INSERT INTO reports (reporter_id, item_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(reporterId, data.itemId, data.reason, data.details, nowIso());
}

export function hasReported(reporterId: number, itemId: number): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM reports WHERE reporter_id = ? AND item_id = ?").get(reporterId, itemId));
}

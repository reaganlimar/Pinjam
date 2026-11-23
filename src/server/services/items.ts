import "server-only";
import { getDb, join, raw, sql, transaction, type Database, type Row } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { itemSchema, parse } from "../validation";
import { notify } from "./notifications";
import { todayDateOnly, type ItemCondition } from "@/lib/format";
import { getUserStats } from "./users";

export const MAX_ITEM_IMAGES = 4;

export type Availability = "available" | "borrowed" | "unavailable";

export type ItemSummary = {
  id: number;
  name: string;
  categoryName: string;
  categorySlug: string;
  condition: ItemCondition;
  pricePerDay: number;
  maxDays: number;
  pickupPoint: string;
  imageKey: string | null;
  availability: Availability;
  owner: { id: number; name: string; avatarKey: string | null };
  createdAt: string;
};

export type ItemDetail = ItemSummary & {
  categoryId: number;
  description: string;
  isAvailable: boolean;
  images: { id: number; key: string }[];
  ownerRating: number | null;
  ownerReviewCount: number;
  ownerVerified: boolean;
  /** Date ranges already reserved by approved/active loans (today or later). */
  reserved: { start: string; end: string }[];
};

export type Category = { id: number; slug: string; name: string };

export async function listCategories(): Promise<Category[]> {
  const rows = await getDb().many(sql`SELECT id, slug, name FROM categories ORDER BY sort`);
  return rows.map((r) => ({ id: Number(r.id), slug: String(r.slug), name: String(r.name) }));
}

/** An item counts as "borrowed" while it is physically out, or while an approved loan covers today. */
function availabilitySql(today: string) {
  return sql`
  CASE
    WHEN NOT i.is_available THEN 'unavailable'
    WHEN EXISTS (
      SELECT 1 FROM loans l WHERE l.item_id = i.id AND (
        l.status IN ('borrowed', 'return_pending') OR
        (l.status IN ('approved', 'ready_for_pickup') AND l.start_date <= ${today}::date AND l.end_date >= ${today}::date)
      )
    ) THEN 'borrowed'
    ELSE 'available'
  END`;
}

function summarySelect(extraColumns = raw("")) {
  return sql`
  SELECT i.*, c.name AS category_name, c.slug AS category_slug,
         u.full_name AS owner_name, u.avatar_key AS owner_avatar,
         (SELECT file_key FROM item_images im WHERE im.item_id = i.id ORDER BY position, id LIMIT 1) AS image_key,
         ${availabilitySql(todayDateOnly())} AS availability
         ${extraColumns}
  FROM items i
  JOIN categories c ON c.id = i.category_id
  JOIN users u ON u.id = i.owner_id`;
}

function toSummary(r: Row): ItemSummary {
  return {
    id: Number(r.id),
    name: String(r.name),
    categoryName: String(r.category_name),
    categorySlug: String(r.category_slug),
    condition: r.condition as ItemCondition,
    pricePerDay: Number(r.price_per_day),
    maxDays: Number(r.max_days),
    pickupPoint: String(r.pickup_point),
    imageKey: (r.image_key as string) ?? null,
    availability: r.availability as Availability,
    owner: { id: Number(r.owner_id), name: String(r.owner_name), avatarKey: (r.owner_avatar as string) ?? null },
    createdAt: String(r.created_at),
  };
}

export type BrowseFilters = {
  q?: string;
  category?: string;
  price?: "free" | "paid";
  sort?: "newest" | "price_low" | "price_high" | "name";
};

export const SORT_OPTIONS: { value: NonNullable<BrowseFilters["sort"]>; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

const ORDER_BY: Record<NonNullable<BrowseFilters["sort"]>, string> = {
  newest: "i.created_at DESC, i.id DESC",
  price_low: "i.price_per_day ASC, i.id DESC",
  price_high: "i.price_per_day DESC, i.id DESC",
  name: "lower(i.name) ASC, i.id",
};

/** Items other students have listed (the viewer's own items are excluded). */
export async function browseItems(viewerId: number, filters: BrowseFilters): Promise<ItemSummary[]> {
  const where = [sql`i.deleted_at IS NULL`, sql`i.is_available`, sql`i.owner_id <> ${viewerId}`];
  if (filters.q?.trim()) {
    const pattern = `%${filters.q.trim().replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    where.push(sql`(i.name ILIKE ${pattern} OR i.description ILIKE ${pattern})`);
  }
  if (filters.category) where.push(sql`c.slug = ${filters.category}`);
  if (filters.price === "free") where.push(sql`i.price_per_day = 0`);
  if (filters.price === "paid") where.push(sql`i.price_per_day > 0`);
  const order = raw(ORDER_BY[filters.sort ?? "newest"] ?? ORDER_BY.newest);
  const rows = await getDb().many(
    sql`${summarySelect()} WHERE ${join(where, " AND ")} ORDER BY ${order} LIMIT 200`,
  );
  return rows.map(toSummary);
}

export async function recentItems(viewerId: number, limit = 4): Promise<ItemSummary[]> {
  const rows = await getDb().many(sql`
    ${summarySelect()}
    WHERE i.deleted_at IS NULL AND i.is_available AND i.owner_id <> ${viewerId}
    ORDER BY i.created_at DESC, i.id DESC LIMIT ${limit}`);
  return rows.map(toSummary);
}

export type OwnedItem = ItemSummary & { pendingRequests: number; isAvailable: boolean };

export async function listOwnedItems(ownerId: number): Promise<OwnedItem[]> {
  const rows = await getDb().many(sql`
    ${summarySelect(raw(", (SELECT count(*) FROM loans l WHERE l.item_id = i.id AND l.status = 'pending') AS pending_requests"))}
    WHERE i.owner_id = ${ownerId} AND i.deleted_at IS NULL
    ORDER BY i.created_at DESC, i.id DESC`);
  return rows.map((r) => ({
    ...toSummary(r),
    pendingRequests: Number(r.pending_requests),
    isAvailable: r.is_available === true,
  }));
}

/** Public listing of another student's items (for the lender profile). */
export async function listUserItems(ownerId: number): Promise<ItemSummary[]> {
  const rows = await getDb().many(sql`
    ${summarySelect()}
    WHERE i.owner_id = ${ownerId} AND i.deleted_at IS NULL AND i.is_available
    ORDER BY i.created_at DESC, i.id DESC`);
  return rows.map(toSummary);
}

/** Loads a live item row, optionally locking it so concurrent loan changes are serialised. */
export async function lockItem(db: Database, id: number, lock = true): Promise<Row> {
  const row = await db.maybe(
    lock
      ? sql`SELECT * FROM items WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`
      : sql`SELECT * FROM items WHERE id = ${id} AND deleted_at IS NULL`,
  );
  if (!row) throw notFound("That item");
  return row;
}

export async function getItem(id: number): Promise<ItemDetail> {
  const db = getDb();
  const today = todayDateOnly();
  const row = await db.maybe(sql`${summarySelect()} WHERE i.id = ${id} AND i.deleted_at IS NULL`);
  if (!row) throw notFound("That item");
  const ownerId = Number(row.owner_id);
  const [images, reserved, owner, stats] = await Promise.all([
    db.many(sql`SELECT id, file_key FROM item_images WHERE item_id = ${id} ORDER BY position, id`),
    db.many(sql`
      SELECT start_date, end_date FROM loans WHERE item_id = ${id}
        AND status IN ('approved', 'ready_for_pickup', 'borrowed', 'return_pending')
        AND (end_date >= ${today}::date OR status IN ('borrowed', 'return_pending'))
      ORDER BY start_date`),
    db.one(sql`SELECT student_verified_at FROM users WHERE id = ${ownerId}`),
    getUserStats(ownerId),
  ]);
  return {
    ...toSummary(row),
    categoryId: Number(row.category_id),
    description: String(row.description),
    isAvailable: row.is_available === true,
    images: images.map((r) => ({ id: Number(r.id), key: String(r.file_key) })),
    ownerRating: stats.rating,
    ownerReviewCount: stats.reviewCount,
    ownerVerified: Boolean(owner.student_verified_at),
    reserved: reserved.map((r) => ({ start: String(r.start_date), end: String(r.end_date) })),
  };
}

async function assertCategory(db: Database, categoryId: number) {
  if (!(await db.maybe(sql`SELECT 1 FROM categories WHERE id = ${categoryId}`))) {
    throw new AppError("Please check the highlighted fields.", "invalid", { categoryId: "Choose a category." });
  }
}

export async function createItem(ownerId: number, input: unknown, imageKeys: string[]): Promise<number> {
  const data = parse(itemSchema, input);
  if (imageKeys.length > MAX_ITEM_IMAGES) throw new AppError(`Add at most ${MAX_ITEM_IMAGES} photos.`);
  return transaction(async (db) => {
    await assertCategory(db, data.categoryId);
    const { id } = await db.one<{ id: number }>(sql`
      INSERT INTO items (owner_id, category_id, name, description, condition, price_per_day, max_days, pickup_point)
      VALUES (${ownerId}, ${data.categoryId}, ${data.name}, ${data.description}, ${data.condition},
              ${data.pricePerDay}, ${data.maxDays}, ${data.pickupPoint})
      RETURNING id`);
    for (const [i, key] of imageKeys.entries()) {
      await db.run(sql`INSERT INTO item_images (item_id, file_key, position) VALUES (${id}, ${key}, ${i})`);
    }
    return Number(id);
  });
}

/** Updates a listing. Returns storage keys of removed images so the caller can delete the files. */
export async function updateItem(
  ownerId: number,
  itemId: number,
  input: unknown,
  changes: { removeImageIds: number[]; addImageKeys: string[] },
): Promise<string[]> {
  const data = parse(itemSchema, input);
  return transaction(async (db) => {
    const item = await lockItem(db, itemId);
    if (Number(item.owner_id) !== ownerId) throw forbidden("Only the owner can edit this listing.");
    await assertCategory(db, data.categoryId);
    const existing = await db.many<{ id: number; file_key: string; position: number }>(
      sql`SELECT id, file_key, position FROM item_images WHERE item_id = ${itemId}`,
    );
    const removed = existing.filter((r) => changes.removeImageIds.includes(Number(r.id)));
    if (existing.length - removed.length + changes.addImageKeys.length > MAX_ITEM_IMAGES) {
      throw new AppError(`Add at most ${MAX_ITEM_IMAGES} photos.`);
    }
    await db.run(sql`
      UPDATE items SET category_id = ${data.categoryId}, name = ${data.name}, description = ${data.description},
        condition = ${data.condition}, price_per_day = ${data.pricePerDay}, max_days = ${data.maxDays},
        pickup_point = ${data.pickupPoint}, updated_at = now()
      WHERE id = ${itemId}`);
    if (removed.length) {
      await db.run(sql`DELETE FROM item_images WHERE id = ANY(${removed.map((r) => Number(r.id))}::int[])`);
    }
    const start = existing.reduce((max, r) => Math.max(max, Number(r.position) + 1), 0);
    for (const [i, key] of changes.addImageKeys.entries()) {
      await db.run(sql`INSERT INTO item_images (item_id, file_key, position) VALUES (${itemId}, ${key}, ${start + i})`);
    }
    return removed.map((r) => String(r.file_key));
  });
}

export async function setItemAvailability(ownerId: number, itemId: number, available: boolean) {
  const db = getDb();
  const item = await lockItem(db, itemId, false);
  if (Number(item.owner_id) !== ownerId) throw forbidden("Only the owner can change this listing.");
  await db.run(sql`UPDATE items SET is_available = ${available}, updated_at = now() WHERE id = ${itemId}`);
}

/**
 * Soft-deletes a listing (history keeps pointing at it). Blocked while an approved or
 * in-progress loan exists; pending requests are declined automatically.
 * Returns the image keys to delete.
 */
export async function deleteItem(ownerId: number, itemId: number): Promise<string[]> {
  return transaction(async (db) => {
    const item = await lockItem(db, itemId);
    if (Number(item.owner_id) !== ownerId) throw forbidden("Only the owner can delete this listing.");
    const active = await db.one<{ n: number }>(sql`
      SELECT count(*) AS n FROM loans WHERE item_id = ${itemId}
        AND status IN ('approved', 'ready_for_pickup', 'borrowed', 'return_pending')`);
    if (Number(active.n) > 0) {
      throw new AppError("This item has an approved or active loan. Finish or cancel it before deleting.", "conflict");
    }
    const pending = await db.many<{ id: number; borrower_id: number }>(
      sql`UPDATE loans SET status = 'rejected', updated_at = now()
          WHERE item_id = ${itemId} AND status = 'pending' RETURNING id, borrower_id`,
    );
    for (const loan of pending) {
      await db.run(sql`
        INSERT INTO loan_events (loan_id, actor_id, from_status, to_status, note)
        VALUES (${loan.id}, ${ownerId}, 'pending', 'rejected', 'Listing removed by owner')`);
      await notify(db, Number(loan.borrower_id), {
        type: "loan_rejected",
        title: `Your request for ${item.name} was declined`,
        body: "The owner removed this listing.",
        link: `/loans/${loan.id}`,
      });
    }
    await db.run(sql`UPDATE items SET deleted_at = now(), is_available = false, updated_at = now() WHERE id = ${itemId}`);
    const images = await db.many<{ file_key: string }>(
      sql`DELETE FROM item_images WHERE item_id = ${itemId} RETURNING file_key`,
    );
    return images.map((r) => r.file_key);
  });
}

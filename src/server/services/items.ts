import "server-only";
import { getDb, nowIso, transaction, type Db, type Row } from "../db";
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

export function listCategories(): Category[] {
  return (getDb().prepare("SELECT id, slug, name FROM categories ORDER BY sort").all() as Row[]).map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
  }));
}

// An item counts as "borrowed" while it is physically out, or while an approved loan covers today.
const AVAILABILITY_SQL = `
  CASE
    WHEN i.is_available = 0 THEN 'unavailable'
    WHEN EXISTS (
      SELECT 1 FROM loans l WHERE l.item_id = i.id AND (
        l.status IN ('borrowed', 'return_pending') OR
        (l.status IN ('approved', 'ready_for_pickup') AND l.start_date <= :today AND l.end_date >= :today)
      )
    ) THEN 'borrowed'
    ELSE 'available'
  END`;

const SUMMARY_SELECT = `
  SELECT i.*, c.name AS category_name, c.slug AS category_slug,
         u.full_name AS owner_name, u.avatar_key AS owner_avatar,
         (SELECT file_key FROM item_images im WHERE im.item_id = i.id ORDER BY position, id LIMIT 1) AS image_key,
         ${AVAILABILITY_SQL} AS availability
  FROM items i
  JOIN categories c ON c.id = i.category_id
  JOIN users u ON u.id = i.owner_id`;

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

/** Items other students have listed (the viewer's own items are excluded). */
export function browseItems(viewerId: number, filters: BrowseFilters): ItemSummary[] {
  const where = ["i.deleted_at IS NULL", "i.is_available = 1", "i.owner_id <> :viewer"];
  const params: Record<string, string | number> = { viewer: viewerId, today: todayDateOnly() };
  if (filters.q?.trim()) {
    where.push("(i.name LIKE :q ESCAPE '\\' OR i.description LIKE :q ESCAPE '\\')");
    params.q = `%${filters.q.trim().replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  }
  if (filters.category) {
    where.push("c.slug = :category");
    params.category = filters.category;
  }
  if (filters.price === "free") where.push("i.price_per_day = 0");
  if (filters.price === "paid") where.push("i.price_per_day > 0");
  const order =
    filters.sort === "price_low"
      ? "i.price_per_day ASC, i.id DESC"
      : filters.sort === "price_high"
        ? "i.price_per_day DESC, i.id DESC"
        : filters.sort === "name"
          ? "i.name COLLATE NOCASE ASC"
          : "i.created_at DESC, i.id DESC";
  const rows = getDb()
    .prepare(`${SUMMARY_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 200`)
    .all(params) as Row[];
  return rows.map(toSummary);
}

export function recentItems(viewerId: number, limit = 4): ItemSummary[] {
  return (
    getDb()
      .prepare(
        `${SUMMARY_SELECT} WHERE i.deleted_at IS NULL AND i.is_available = 1 AND i.owner_id <> :viewer
         ORDER BY i.created_at DESC, i.id DESC LIMIT :limit`,
      )
      .all({ viewer: viewerId, today: todayDateOnly(), limit }) as Row[]
  ).map(toSummary);
}

export type OwnedItem = ItemSummary & { pendingRequests: number; isAvailable: boolean };

export function listOwnedItems(ownerId: number): OwnedItem[] {
  const rows = getDb()
    .prepare(
      `${SUMMARY_SELECT.replace(
        "AS availability",
        "AS availability, (SELECT COUNT(*) FROM loans l WHERE l.item_id = i.id AND l.status = 'pending') AS pending_requests",
      )}
       WHERE i.owner_id = :owner AND i.deleted_at IS NULL ORDER BY i.created_at DESC, i.id DESC`,
    )
    .all({ owner: ownerId, today: todayDateOnly() }) as Row[];
  return rows.map((r) => ({
    ...toSummary(r),
    pendingRequests: Number(r.pending_requests),
    isAvailable: Number(r.is_available) === 1,
  }));
}

/** Public listing of another student's items (for the lender profile). */
export function listUserItems(ownerId: number): ItemSummary[] {
  return (
    getDb()
      .prepare(
        `${SUMMARY_SELECT} WHERE i.owner_id = :owner AND i.deleted_at IS NULL AND i.is_available = 1
         ORDER BY i.created_at DESC, i.id DESC`,
      )
      .all({ owner: ownerId, today: todayDateOnly() }) as Row[]
  ).map(toSummary);
}

function getItemRow(db: Db, id: number): Row {
  const row = db.prepare("SELECT * FROM items WHERE id = ? AND deleted_at IS NULL").get(id) as Row | undefined;
  if (!row) throw notFound("That item");
  return row;
}

export function getItem(id: number): ItemDetail {
  const db = getDb();
  const today = todayDateOnly();
  const row = db
    .prepare(`${SUMMARY_SELECT} WHERE i.id = :id AND i.deleted_at IS NULL`)
    .get({ id, today }) as Row | undefined;
  if (!row) throw notFound("That item");
  const images = (
    db.prepare("SELECT id, file_key FROM item_images WHERE item_id = ? ORDER BY position, id").all(id) as Row[]
  ).map((r) => ({ id: Number(r.id), key: String(r.file_key) }));
  const reserved = (
    db
      .prepare(
        `SELECT start_date, end_date FROM loans WHERE item_id = ?
         AND status IN ('approved','ready_for_pickup','borrowed','return_pending')
         AND (end_date >= ? OR status IN ('borrowed','return_pending'))
         ORDER BY start_date`,
      )
      .all(id, today) as Row[]
  ).map((r) => ({ start: String(r.start_date), end: String(r.end_date) }));
  const owner = db.prepare("SELECT student_verified_at FROM users WHERE id = ?").get(Number(row.owner_id)) as Row;
  const stats = getUserStats(Number(row.owner_id));
  return {
    ...toSummary(row),
    categoryId: Number(row.category_id),
    description: String(row.description),
    isAvailable: Number(row.is_available) === 1,
    images,
    ownerRating: stats.rating,
    ownerReviewCount: stats.reviewCount,
    ownerVerified: Boolean(owner.student_verified_at),
    reserved,
  };
}

function assertCategory(db: Db, categoryId: number) {
  if (!db.prepare("SELECT 1 FROM categories WHERE id = ?").get(categoryId)) {
    throw new AppError("Please check the highlighted fields.", "invalid", { categoryId: "Choose a category." });
  }
}

export function createItem(ownerId: number, input: unknown, imageKeys: string[]): number {
  const data = parse(itemSchema, input);
  if (imageKeys.length > MAX_ITEM_IMAGES) throw new AppError(`Add at most ${MAX_ITEM_IMAGES} photos.`);
  return transaction((db) => {
    assertCategory(db, data.categoryId);
    const now = nowIso();
    const { id } = db
      .prepare(
        `INSERT INTO items (owner_id, category_id, name, description, condition, price_per_day, max_days,
                            pickup_point, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        ownerId,
        data.categoryId,
        data.name,
        data.description,
        data.condition,
        data.pricePerDay,
        data.maxDays,
        data.pickupPoint,
        now,
        now,
      ) as { id: number };
    imageKeys.forEach((key, i) =>
      db.prepare("INSERT INTO item_images (item_id, file_key, position) VALUES (?, ?, ?)").run(id, key, i),
    );
    return Number(id);
  });
}

/** Updates a listing. Returns storage keys of removed images so the caller can delete the files. */
export function updateItem(
  ownerId: number,
  itemId: number,
  input: unknown,
  changes: { removeImageIds: number[]; addImageKeys: string[] },
): string[] {
  const data = parse(itemSchema, input);
  return transaction((db) => {
    const item = getItemRow(db, itemId);
    if (Number(item.owner_id) !== ownerId) throw forbidden("Only the owner can edit this listing.");
    assertCategory(db, data.categoryId);
    const existing = db.prepare("SELECT id, file_key FROM item_images WHERE item_id = ?").all(itemId) as Row[];
    const removed = existing.filter((r) => changes.removeImageIds.includes(Number(r.id)));
    if (existing.length - removed.length + changes.addImageKeys.length > MAX_ITEM_IMAGES) {
      throw new AppError(`Add at most ${MAX_ITEM_IMAGES} photos.`);
    }
    db.prepare(
      `UPDATE items SET category_id = ?, name = ?, description = ?, condition = ?, price_per_day = ?,
              max_days = ?, pickup_point = ?, updated_at = ? WHERE id = ?`,
    ).run(
      data.categoryId,
      data.name,
      data.description,
      data.condition,
      data.pricePerDay,
      data.maxDays,
      data.pickupPoint,
      nowIso(),
      itemId,
    );
    for (const r of removed) db.prepare("DELETE FROM item_images WHERE id = ?").run(Number(r.id));
    const start = existing.length;
    changes.addImageKeys.forEach((key, i) =>
      db.prepare("INSERT INTO item_images (item_id, file_key, position) VALUES (?, ?, ?)").run(itemId, key, start + i),
    );
    return removed.map((r) => String(r.file_key));
  });
}

export function setItemAvailability(ownerId: number, itemId: number, available: boolean) {
  const db = getDb();
  const item = getItemRow(db, itemId);
  if (Number(item.owner_id) !== ownerId) throw forbidden("Only the owner can change this listing.");
  db.prepare("UPDATE items SET is_available = ?, updated_at = ? WHERE id = ?").run(available ? 1 : 0, nowIso(), itemId);
}

/**
 * Soft-deletes a listing (history keeps pointing at it). Blocked while an approved or
 * in-progress loan exists; pending requests are declined automatically.
 */
export function deleteItem(ownerId: number, itemId: number): string[] {
  return transaction((db) => {
    const item = getItemRow(db, itemId);
    if (Number(item.owner_id) !== ownerId) throw forbidden("Only the owner can delete this listing.");
    const active = db
      .prepare(
        `SELECT COUNT(*) n FROM loans WHERE item_id = ?
         AND status IN ('approved','ready_for_pickup','borrowed','return_pending')`,
      )
      .get(itemId) as Row;
    if (Number(active.n) > 0) {
      throw new AppError("This item has an approved or active loan. Finish or cancel it before deleting.", "conflict");
    }
    const pending = db
      .prepare("SELECT id, borrower_id FROM loans WHERE item_id = ? AND status = 'pending'")
      .all(itemId) as Row[];
    const now = nowIso();
    for (const loan of pending) {
      db.prepare("UPDATE loans SET status = 'rejected', updated_at = ? WHERE id = ?").run(now, Number(loan.id));
      db.prepare(
        "INSERT INTO loan_events (loan_id, actor_id, from_status, to_status, note, created_at) VALUES (?, ?, 'pending', 'rejected', ?, ?)",
      ).run(Number(loan.id), ownerId, "Listing removed by owner", now);
      notify(db, Number(loan.borrower_id), {
        type: "loan_rejected",
        title: `Your request for ${item.name} was declined`,
        body: "The owner removed this listing.",
        link: `/loans/${loan.id}`,
      });
    }
    db.prepare("UPDATE items SET deleted_at = ?, is_available = 0, updated_at = ? WHERE id = ?").run(now, now, itemId);
    const images = db.prepare("SELECT file_key FROM item_images WHERE item_id = ?").all(itemId) as Row[];
    db.prepare("DELETE FROM item_images WHERE item_id = ?").run(itemId);
    return images.map((r) => String(r.file_key));
  });
}

export function itemOwnerId(itemId: number): number {
  return Number(getItemRow(getDb(), itemId).owner_id);
}

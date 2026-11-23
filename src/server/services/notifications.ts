import "server-only";
import { getDb, sql, type Database, type Row } from "../db";
import { addDays, todayDateOnly } from "@/lib/format";

export type NotificationType =
  | "loan_requested"
  | "loan_approved"
  | "loan_rejected"
  | "loan_cancelled"
  | "loan_ready"
  | "loan_picked_up"
  | "loan_return_marked"
  | "loan_completed"
  | "loan_due_soon"
  | "message"
  | "review";

export type Notification = {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function notify(
  db: Database,
  userId: number,
  n: { type: NotificationType; title: string; body?: string; link?: string },
) {
  await db.run(sql`
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (${userId}, ${n.type}, ${n.title}, ${n.body ?? ""}, ${n.link ?? null})`);
}

const toNotification = (r: Row): Notification => ({
  id: Number(r.id),
  type: r.type as NotificationType,
  title: String(r.title),
  body: String(r.body),
  link: (r.link as string) ?? null,
  read: r.read_at !== null,
  createdAt: String(r.created_at),
});

export async function listNotifications(userId: number, limit = 100): Promise<Notification[]> {
  const rows = await getDb().many(
    sql`SELECT * FROM notifications WHERE user_id = ${userId} ORDER BY id DESC LIMIT ${limit}`,
  );
  return rows.map(toNotification);
}

export async function getNotification(userId: number, id: number): Promise<Notification | null> {
  const row = await getDb().maybe(sql`SELECT * FROM notifications WHERE id = ${id} AND user_id = ${userId}`);
  return row ? toNotification(row) : null;
}

export async function unreadCount(userId: number): Promise<number> {
  const r = await getDb().one<{ n: number }>(
    sql`SELECT count(*) AS n FROM notifications WHERE user_id = ${userId} AND read_at IS NULL`,
  );
  return Number(r.n);
}

export async function markRead(userId: number, id: number) {
  await getDb().run(
    sql`UPDATE notifications SET read_at = now() WHERE id = ${id} AND user_id = ${userId} AND read_at IS NULL`,
  );
}

export async function markAllRead(userId: number) {
  await getDb().run(sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL`);
}

/**
 * There's no background job runner, so "return date approaching" reminders are created
 * lazily whenever the borrower loads a page: any borrowed item due today or tomorrow
 * gets exactly one reminder (tracked by loans.reminder_sent_at, claimed atomically).
 */
export async function generateDueReminders(userId: number) {
  const db = getDb();
  const today = todayDateOnly();
  const due = await db.many<{ id: number; end_date: string; name: string }>(sql`
    UPDATE loans l SET reminder_sent_at = now()
    FROM items i, users u
    WHERE i.id = l.item_id AND u.id = l.borrower_id AND u.notify_reminders
      AND l.borrower_id = ${userId} AND l.status = 'borrowed' AND l.reminder_sent_at IS NULL
      AND l.end_date <= ${addDays(today, 1)}::date
    RETURNING l.id, l.end_date, i.name`);
  for (const loan of due) {
    const overdue = loan.end_date < today;
    await notify(db, userId, {
      type: "loan_due_soon",
      title: overdue ? `${loan.name} is overdue` : `Return ${loan.name} soon`,
      body: overdue ? "Please return it as soon as you can." : "Your return date is approaching.",
      link: `/loans/${loan.id}`,
    });
  }
}

import "server-only";
import { getDb, nowIso, type Db, type Row } from "../db";
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

export function notify(
  db: Db,
  userId: number,
  n: { type: NotificationType; title: string; body?: string; link?: string },
) {
  db.prepare(
    "INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(userId, n.type, n.title, n.body ?? "", n.link ?? null, nowIso());
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

export function listNotifications(userId: number, limit = 100): Notification[] {
  return (
    getDb()
      .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?")
      .all(userId, limit) as Row[]
  ).map(toNotification);
}

export function unreadCount(userId: number): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .get(userId) as Row;
  return Number(r.n);
}

export function markRead(userId: number, id: number) {
  getDb()
    .prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL")
    .run(nowIso(), id, userId);
}

export function markAllRead(userId: number) {
  getDb()
    .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
    .run(nowIso(), userId);
}

/**
 * There's no background job runner, so "return date approaching" reminders are created
 * lazily whenever the borrower loads a page: any borrowed item due today or tomorrow
 * gets exactly one reminder (tracked by loans.reminder_sent_at).
 */
export function generateDueReminders(userId: number) {
  const db = getDb();
  const prefs = db.prepare("SELECT notify_reminders FROM users WHERE id = ?").get(userId) as Row | undefined;
  if (!prefs || Number(prefs.notify_reminders) !== 1) return;
  const tomorrow = addDays(todayDateOnly(), 1);
  const due = db
    .prepare(
      `SELECT l.id, l.end_date, i.name FROM loans l JOIN items i ON i.id = l.item_id
       WHERE l.borrower_id = ? AND l.status = 'borrowed' AND l.reminder_sent_at IS NULL AND l.end_date <= ?`,
    )
    .all(userId, tomorrow) as Row[];
  for (const loan of due) {
    const overdue = String(loan.end_date) < todayDateOnly();
    notify(db, userId, {
      type: "loan_due_soon",
      title: overdue ? `${loan.name} is overdue` : `Return ${loan.name} soon`,
      body: overdue ? "Please return it as soon as you can." : "Your return date is approaching.",
      link: `/loans/${loan.id}`,
    });
    db.prepare("UPDATE loans SET reminder_sent_at = ? WHERE id = ?").run(nowIso(), Number(loan.id));
  }
}

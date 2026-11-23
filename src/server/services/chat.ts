import "server-only";
import { getDb, nowIso, transaction, type Row } from "../db";
import { forbidden, notFound } from "../errors";
import { messageSchema, parse } from "../validation";
import { notify } from "./notifications";

/**
 * One conversation per (item, borrower): the borrower talks to the item's owner about
 * pickup, before or during a loan.
 */

export type ConversationSummary = {
  id: number;
  itemId: number;
  itemName: string;
  pickupPoint: string;
  other: { id: number; name: string; avatarKey: string | null };
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
};

export type ChatMessage = { id: number; senderId: number; body: string; createdAt: string };

/** Opens (or creates) the borrower's conversation about an item. */
export function openConversation(itemId: number, userId: number, borrowerId?: number): number {
  return transaction((db) => {
    const item = db.prepare("SELECT owner_id FROM items WHERE id = ?").get(itemId) as Row | undefined;
    if (!item) throw notFound("That item");
    const ownerId = Number(item.owner_id);
    // The owner opens a chat with a specific requester; anyone else opens their own chat with the owner.
    const borrower = userId === ownerId ? borrowerId : userId;
    if (!borrower || borrower === ownerId) throw forbidden("You can't message yourself about your own item.");
    if (userId === ownerId) {
      const related = db.prepare("SELECT 1 FROM loans WHERE item_id = ? AND borrower_id = ?").get(itemId, borrower);
      const existing = db.prepare("SELECT 1 FROM conversations WHERE item_id = ? AND borrower_id = ?").get(itemId, borrower);
      if (!related && !existing) throw forbidden();
    }
    const found = db
      .prepare("SELECT id FROM conversations WHERE item_id = ? AND borrower_id = ?")
      .get(itemId, borrower) as Row | undefined;
    if (found) return Number(found.id);
    const { id } = db
      .prepare(
        "INSERT INTO conversations (item_id, borrower_id, lender_id, created_at) VALUES (?, ?, ?, ?) RETURNING id",
      )
      .get(itemId, borrower, ownerId, nowIso()) as { id: number };
    return Number(id);
  });
}

function loadConversation(conversationId: number, userId: number): Row {
  const row = getDb()
    .prepare(
      `SELECT c.*, i.name AS item_name, i.pickup_point FROM conversations c JOIN items i ON i.id = c.item_id WHERE c.id = ?`,
    )
    .get(conversationId) as Row | undefined;
  if (!row || (Number(row.borrower_id) !== userId && Number(row.lender_id) !== userId)) throw notFound("That chat");
  return row;
}

export function getConversation(conversationId: number, userId: number) {
  const c = loadConversation(conversationId, userId);
  const otherId = Number(c.borrower_id) === userId ? Number(c.lender_id) : Number(c.borrower_id);
  const other = getDb().prepare("SELECT id, full_name, avatar_key FROM users WHERE id = ?").get(otherId) as Row;
  return {
    id: Number(c.id),
    itemId: Number(c.item_id),
    itemName: String(c.item_name),
    pickupPoint: String(c.pickup_point),
    other: { id: otherId, name: String(other.full_name), avatarKey: (other.avatar_key as string) ?? null },
  };
}

export function listConversations(userId: number): ConversationSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*, i.name AS item_name, i.pickup_point,
              u.id AS other_id, u.full_name AS other_name, u.avatar_key AS other_avatar,
              (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> :me AND m.read_at IS NULL) AS unread
       FROM conversations c
       JOIN items i ON i.id = c.item_id
       JOIN users u ON u.id = CASE WHEN c.borrower_id = :me THEN c.lender_id ELSE c.borrower_id END
       WHERE (c.borrower_id = :me OR c.lender_id = :me) AND c.last_message_at IS NOT NULL
       ORDER BY c.last_message_at DESC`,
    )
    .all({ me: userId }) as Row[];
  return rows.map((r) => ({
    id: Number(r.id),
    itemId: Number(r.item_id),
    itemName: String(r.item_name),
    pickupPoint: String(r.pickup_point),
    other: { id: Number(r.other_id), name: String(r.other_name), avatarKey: (r.other_avatar as string) ?? null },
    lastMessage: (r.last_body as string) ?? null,
    lastMessageAt: (r.last_message_at as string) ?? null,
    unread: Number(r.unread),
  }));
}

/** Messages after `afterId` (for polling); marks the other person's messages as read. */
export function listMessages(conversationId: number, userId: number, afterId = 0): ChatMessage[] {
  loadConversation(conversationId, userId);
  const db = getDb();
  db.prepare("UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL").run(
    nowIso(),
    conversationId,
    userId,
  );
  return (
    db
      .prepare("SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 500")
      .all(conversationId, afterId) as Row[]
  ).map((r) => ({ id: Number(r.id), senderId: Number(r.sender_id), body: String(r.body), createdAt: String(r.created_at) }));
}

export function sendMessage(conversationId: number, senderId: number, input: unknown): ChatMessage {
  const data = parse(messageSchema, input);
  return transaction((db) => {
    const c = loadConversation(conversationId, senderId);
    const now = nowIso();
    const row = db
      .prepare("INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?) RETURNING *")
      .get(conversationId, senderId, data.body, now) as Row;
    db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(now, conversationId);
    const recipient = Number(c.borrower_id) === senderId ? Number(c.lender_id) : Number(c.borrower_id);
    // Only notify for the first unread message so a chat doesn't flood the inbox.
    const unread = db
      .prepare("SELECT COUNT(*) n FROM messages WHERE conversation_id = ? AND sender_id = ? AND read_at IS NULL")
      .get(conversationId, senderId) as Row;
    if (Number(unread.n) === 1) {
      const sender = db.prepare("SELECT full_name FROM users WHERE id = ?").get(senderId) as Row;
      notify(db, recipient, {
        type: "message",
        title: `New message from ${sender.full_name}`,
        body: `About ${c.item_name}`,
        link: `/chat/${conversationId}`,
      });
    }
    return { id: Number(row.id), senderId, body: String(row.body), createdAt: now };
  });
}

export function unreadMessageCount(userId: number): number {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE (c.borrower_id = ? OR c.lender_id = ?) AND m.sender_id <> ? AND m.read_at IS NULL`,
    )
    .get(userId, userId, userId) as Row;
  return Number(r.n);
}

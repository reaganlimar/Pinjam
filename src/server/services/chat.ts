import "server-only";
import { getDb, sql, transaction, type Database, type Row } from "../db";
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
export async function openConversation(itemId: number, userId: number, borrowerId?: number): Promise<number> {
  return transaction(async (db) => {
    const item = await db.maybe<{ owner_id: number }>(sql`SELECT owner_id FROM items WHERE id = ${itemId}`);
    if (!item) throw notFound("That item");
    const ownerId = Number(item.owner_id);
    // The owner opens a chat with a specific requester; anyone else opens their own chat with the owner.
    const borrower = userId === ownerId ? borrowerId : userId;
    if (!borrower || borrower === ownerId) throw forbidden("You can't message yourself about your own item.");
    if (userId === ownerId) {
      const related = await db.maybe(sql`SELECT 1 FROM loans WHERE item_id = ${itemId} AND borrower_id = ${borrower}`);
      const existing = await db.maybe(
        sql`SELECT 1 FROM conversations WHERE item_id = ${itemId} AND borrower_id = ${borrower}`,
      );
      if (!related && !existing) throw forbidden();
    }
    // Insert-or-fetch in one statement so two clicks can't create duplicates.
    const row = await db.one<{ id: number }>(sql`
      INSERT INTO conversations (item_id, borrower_id, lender_id) VALUES (${itemId}, ${borrower}, ${ownerId})
      ON CONFLICT (item_id, borrower_id) DO UPDATE SET item_id = EXCLUDED.item_id
      RETURNING id`);
    return Number(row.id);
  });
}

async function loadConversation(db: Database, conversationId: number, userId: number): Promise<Row> {
  const row = await db.maybe(sql`
    SELECT c.*, i.name AS item_name, i.pickup_point FROM conversations c JOIN items i ON i.id = c.item_id
    WHERE c.id = ${conversationId}`);
  if (!row || (Number(row.borrower_id) !== userId && Number(row.lender_id) !== userId)) throw notFound("That chat");
  return row;
}

export async function getConversation(conversationId: number, userId: number) {
  const db = getDb();
  const c = await loadConversation(db, conversationId, userId);
  const otherId = Number(c.borrower_id) === userId ? Number(c.lender_id) : Number(c.borrower_id);
  const other = await db.one(sql`SELECT id, full_name, avatar_key FROM users WHERE id = ${otherId}`);
  return {
    id: Number(c.id),
    itemId: Number(c.item_id),
    itemName: String(c.item_name),
    pickupPoint: String(c.pickup_point),
    other: { id: otherId, name: String(other.full_name), avatarKey: (other.avatar_key as string) ?? null },
  };
}

export async function listConversations(userId: number): Promise<ConversationSummary[]> {
  const rows = await getDb().many(sql`
    SELECT c.*, i.name AS item_name, i.pickup_point,
           u.id AS other_id, u.full_name AS other_name, u.avatar_key AS other_avatar,
           (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT count(*) FROM messages m
             WHERE m.conversation_id = c.id AND m.sender_id <> ${userId} AND m.read_at IS NULL) AS unread
    FROM conversations c
    JOIN items i ON i.id = c.item_id
    JOIN users u ON u.id = CASE WHEN c.borrower_id = ${userId} THEN c.lender_id ELSE c.borrower_id END
    WHERE (c.borrower_id = ${userId} OR c.lender_id = ${userId}) AND c.last_message_at IS NOT NULL
    ORDER BY c.last_message_at DESC`);
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
export async function listMessages(conversationId: number, userId: number, afterId = 0): Promise<ChatMessage[]> {
  const db = getDb();
  await loadConversation(db, conversationId, userId);
  await db.run(sql`
    UPDATE messages SET read_at = now()
    WHERE conversation_id = ${conversationId} AND sender_id <> ${userId} AND read_at IS NULL`);
  const rows = await db.many(sql`
    SELECT id, sender_id, body, created_at FROM messages
    WHERE conversation_id = ${conversationId} AND id > ${afterId} ORDER BY id LIMIT 500`);
  return rows.map((r) => ({
    id: Number(r.id),
    senderId: Number(r.sender_id),
    body: String(r.body),
    createdAt: String(r.created_at),
  }));
}

export async function sendMessage(conversationId: number, senderId: number, input: unknown): Promise<ChatMessage> {
  const data = parse(messageSchema, input);
  return transaction(async (db) => {
    const c = await loadConversation(db, conversationId, senderId);
    const row = await db.one<{ id: number; created_at: string }>(sql`
      INSERT INTO messages (conversation_id, sender_id, body) VALUES (${conversationId}, ${senderId}, ${data.body})
      RETURNING id, created_at`);
    await db.run(sql`UPDATE conversations SET last_message_at = ${row.created_at} WHERE id = ${conversationId}`);
    const recipient = Number(c.borrower_id) === senderId ? Number(c.lender_id) : Number(c.borrower_id);
    // Only notify for the first unread message so a chat doesn't flood the inbox.
    const unread = await db.one<{ n: number }>(sql`
      SELECT count(*) AS n FROM messages
      WHERE conversation_id = ${conversationId} AND sender_id = ${senderId} AND read_at IS NULL`);
    if (Number(unread.n) === 1) {
      const sender = await db.one<{ full_name: string }>(sql`SELECT full_name FROM users WHERE id = ${senderId}`);
      await notify(db, recipient, {
        type: "message",
        title: `New message from ${sender.full_name}`,
        body: `About ${c.item_name}`,
        link: `/chat/${conversationId}`,
      });
    }
    return { id: Number(row.id), senderId, body: data.body, createdAt: row.created_at };
  });
}

export async function unreadMessageCount(userId: number): Promise<number> {
  const r = await getDb().one<{ n: number }>(sql`
    SELECT count(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.borrower_id = ${userId} OR c.lender_id = ${userId}) AND m.sender_id <> ${userId} AND m.read_at IS NULL`);
  return Number(r.n);
}

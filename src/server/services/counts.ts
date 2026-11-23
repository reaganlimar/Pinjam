import "server-only";
import { generateDueReminders, unreadCount } from "./notifications";
import { unreadMessageCount } from "./chat";
import { pendingRequestCount } from "./loans";

export type NavCounts = { notifications: number; messages: number; requests: number };

/** Badge counts for the navigation. Also creates any due-date reminders that are now due. */
export async function getNavCounts(userId: number): Promise<NavCounts> {
  await generateDueReminders(userId);
  const [notifications, messages, requests] = await Promise.all([
    unreadCount(userId),
    unreadMessageCount(userId),
    pendingRequestCount(userId),
  ]);
  return { notifications, messages, requests };
}

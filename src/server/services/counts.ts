import "server-only";
import { generateDueReminders, unreadCount } from "./notifications";
import { unreadMessageCount } from "./chat";
import { pendingRequestCount } from "./loans";

export type NavCounts = { notifications: number; messages: number; requests: number };

/** Badge counts for the navigation. Also creates any due-date reminders that are now due. */
export function getNavCounts(userId: number): NavCounts {
  generateDueReminders(userId);
  return {
    notifications: unreadCount(userId),
    messages: unreadMessageCount(userId),
    requests: pendingRequestCount(userId),
  };
}

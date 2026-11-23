import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { listNotifications, type Notification } from "@/server/services/notifications";
import { markAllReadAction, openNotificationAction } from "@/server/actions/account";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/misc";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Notifications" };

/** Figma "Notifications": rows with an unread dot, grouped by age. */
export default async function NotificationsPage() {
  const user = await requireUser();
  const items = listNotifications(user.id);
  const year = new Date().getFullYear();
  const groups: [string, Notification[]][] = [
    ["This year", items.filter((n) => new Date(n.createdAt).getFullYear() === year)],
    ["More than one year ago", items.filter((n) => new Date(n.createdAt).getFullYear() < year)],
  ];
  const hasUnread = items.some((n) => !n.read);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        backHref="/browse"
        title="Notifications"
        action={
          hasUnread ? (
            <form action={markAllReadAction}>
              <button type="submit" className="text-[13px] font-semibold text-primary hover:underline">
                Mark all read
              </button>
            </form>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState title="You're all caught up" body="Requests, approvals and reminders will show up here." />
      ) : (
        <div className="-mx-4 md:mx-0">
          {groups
            .filter(([, list]) => list.length)
            .map(([label, list]) => (
              <section key={label} className="mb-6">
                <h2 className="px-4 pb-2 text-[20px] font-medium text-ink md:px-0">{label}</h2>
                <ul className="border-t border-line md:rounded-[12px] md:border md:bg-surface">
                  {list.map((n) => (
                    <li key={n.id} className="border-b border-line last:border-b-0">
                      <form action={openNotificationAction.bind(null, n.id)}>
                        <button
                          type="submit"
                          className={cn(
                            "relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken",
                            n.read ? "bg-transparent" : "bg-surface",
                          )}
                        >
                          <span
                            className={cn("mt-[7px] size-3 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-[15px] text-ink", !n.read && "font-medium")}>{n.title}</span>
                            <span className="block text-[13px] text-muted">
                              {n.body ? `${n.body.replace(/\.$/, "")} · ` : ""}
                              {formatRelative(n.createdAt)}
                            </span>
                          </span>
                          {!n.read && <span className="sr-only">Unread</span>}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

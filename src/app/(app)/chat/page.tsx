import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/server/session";
import { listConversations } from "@/server/services/chat";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Chat" };

/** Figma "Chat Menu". */
export default async function ChatListPage() {
  const user = await requireUser();
  const conversations = listConversations(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader backHref="/profile" title="Chat" />
      <h2 className="pb-3 text-[20px] font-medium text-ink">Recents</h2>
      {conversations.length === 0 ? (
        <EmptyState
          title="No messages yet"
          body="Use “Chat with lender about pickup time” on an item to start a conversation."
        />
      ) : (
        <ul className="-mx-4 border-t border-line md:mx-0 md:rounded-[12px] md:border md:bg-surface">
          {conversations.map((c) => (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <Link href={`/chat/${c.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-sunken">
                <Avatar name={c.other.name} imageKey={c.other.avatarKey} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                    <span className="truncate">{c.other.name}</span>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-primary px-1.5 text-[11px] text-on-primary">{c.unread}</span>
                    )}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    {c.itemName} · {c.lastMessage}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-muted">{c.lastMessageAt && formatRelative(c.lastMessageAt)}</span>
                <ChevronRight className="size-5 shrink-0 text-ink" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

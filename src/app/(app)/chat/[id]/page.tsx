import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getConversation, listMessages } from "@/server/services/chat";
import { getUserStats } from "@/server/services/users";
import { AppError } from "@/server/errors";
import { BackButton } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Stars } from "@/components/ui/stars";
import { ChatThread } from "./chat-thread";

export const metadata: Metadata = { title: "Chat" };

/** Figma "Chat - User". */
export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  const user = await requireUser();
  const id = Number((await params).id);
  let convo;
  try {
    convo = await getConversation(id, user.id);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }
  const messages = await listMessages(id, user.id);
  const stats = await getUserStats(convo.other.id);
  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col md:h-[calc(100dvh-72px-24px)]">
      <header className="-mx-4 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:mx-0 md:mt-6 md:rounded-t-[12px] md:border md:border-b">
        <BackButton href="/chat" />
        <Avatar name={convo.other.name} imageKey={convo.other.avatarKey} size="md" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-ink">{convo.other.name}</p>
          <p className="truncate text-[13px] text-muted">
            {convo.itemName} · {convo.pickupPoint}
          </p>
          <Stars rating={stats.rating} count={stats.reviewCount} />
        </div>
      </header>
      <ChatThread conversationId={id} meId={user.id} initial={messages} />
    </div>
  );
}

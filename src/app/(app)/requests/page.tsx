import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { receivedRequests, sentRequests } from "@/server/services/loans";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, Tabs } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { ReceivedRequestCard, SentRequestCard } from "@/components/loans/loan-cards";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Requests" };

/** Figma "Requests - Received" / "Requests - Sent". */
export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const user = await requireUser();
  const tab = (await searchParams).tab === "sent" ? "sent" : "received";
  const received = await receivedRequests(user.id);
  const sent = await sentRequests(user.id);
  const pendingCount = received.filter((l) => l.status === "pending").length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Requests" />
      <Tabs
        active={tab}
        tabs={[
          { key: "received", label: "Received", href: "/requests", count: pendingCount },
          { key: "sent", label: "Sent", href: "/requests?tab=sent" },
        ]}
      />
      <div className="mt-6 space-y-3">
        {tab === "received" ? (
          received.length ? (
            received.map((loan) => (
              <ReceivedRequestCard key={loan.id} loan={loan} approveBlockedFor={can(user, "approve_loan") ? undefined : user} />
            ))
          ) : (
            <EmptyState
              title="No requests yet"
              body="When someone asks to borrow one of your items, it shows up here."
              action={
                <LinkButton href="/items/new" size="md" variant="outline">
                  List an item
                </LinkButton>
              }
            />
          )
        ) : sent.length ? (
          sent.map((loan) => <SentRequestCard key={loan.id} loan={loan} />)
        ) : (
          <EmptyState
            title="You haven't requested anything"
            body="Find an item on Browse and request to borrow it."
            action={
              <LinkButton href="/browse" size="md" variant="outline">
                Browse items
              </LinkButton>
            }
          />
        )}
      </div>
    </div>
  );
}

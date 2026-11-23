import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { activeBorrows, activeLends, loanHistory } from "@/server/services/loans";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { EmptyState, Tabs } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { ActiveLoanCard, HistoryLoanCard, ReceivedRequestCard } from "@/components/loans/loan-cards";

export const metadata: Metadata = { title: "My Loans" };

/** Figma "My Loans - Active" plus History (borrowing and lending). */
export default async function LoansPage({ searchParams }: PageProps<"/loans">) {
  const user = await requireUser();
  const tab = (await searchParams).tab === "history" ? "history" : "active";
  const borrowing = activeBorrows(user.id);
  const lending = activeLends(user.id);
  const history = tab === "history" ? loanHistory(user.id) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Loans" />
      <Tabs
        active={tab}
        tabs={[
          { key: "active", label: "Active", href: "/loans" },
          { key: "history", label: "History", href: "/loans?tab=history" },
        ]}
      />
      {tab === "active" ? (
        <div className="mt-6 space-y-8">
          <section>
            <SectionTitle>Borrowing</SectionTitle>
            {borrowing.length ? (
              <div className="space-y-3">
                {borrowing.map((loan) => (
                  <ActiveLoanCard key={loan.id} loan={loan} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nothing borrowed right now"
                body="Approved requests and items you're borrowing appear here."
                action={
                  <LinkButton href="/browse" size="md" variant="outline">
                    Browse items
                  </LinkButton>
                }
              />
            )}
          </section>
          {lending.length > 0 && (
            <section>
              <SectionTitle>Lending</SectionTitle>
              <div className="space-y-3">
                {lending.map((loan) => (
                  <ReceivedRequestCard key={loan.id} loan={loan} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {history.length ? (
            history.map((loan) => <HistoryLoanCard key={loan.id} loan={loan} viewerId={user.id} />)
          ) : (
            <EmptyState title="No history yet" body="Completed, declined and cancelled loans are listed here." />
          )}
        </div>
      )}
    </div>
  );
}

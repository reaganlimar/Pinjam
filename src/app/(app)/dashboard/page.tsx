import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/session";
import { getDashboard } from "@/server/services/dashboard";
import { getUserStats } from "@/server/services/users";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { StatTile } from "@/components/profile/stat-tile";
import { ItemGrid } from "@/components/items/item-card";
import { ActiveLoanCard, ReceivedRequestCard, SentRequestCard } from "@/components/loans/loan-cards";
import { Badge } from "@/components/ui/badge";
import { formatDay, formatRelative } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/loan-status";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Not a Figma frame: assembled from Figma pieces (stat tiles, request cards, loan rows,
 * item cards) to give one overview of what needs attention.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const d = getDashboard(user.id);
  const stats = getUserStats(user.id);

  return (
    <div>
      <PageHeader title={`Hi, ${user.fullName.split(" ")[0]}`} subtitle="Here's what's happening with your loans." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={d.needsAction.length} label="Need your action" href="/requests" />
        <StatTile value={d.borrowing.length} label="You're borrowing" href="/loans" />
        <StatTile value={d.lentOut.length} label="Lent out now" href="/loans" />
        <StatTile value={stats.itemsListed} label="Items listed" href="/me/items" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle
            action={
              <Link href="/requests" className="text-[13px] font-semibold text-primary hover:underline">
                All requests
              </Link>
            }
          >
            Needs your action
          </SectionTitle>
          {d.needsAction.length ? (
            <div className="space-y-3">
              {d.needsAction.slice(0, 4).map((l) => (
                <ReceivedRequestCard key={l.id} loan={l} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing to approve" body="New requests for your items will appear here." />
          )}
        </section>

        <section>
          <SectionTitle
            action={
              <Link href="/loans" className="text-[13px] font-semibold text-primary hover:underline">
                My loans
              </Link>
            }
          >
            You&apos;re borrowing
          </SectionTitle>
          {d.borrowing.length ? (
            <div className="space-y-3">
              {d.borrowing.map((l) => (
                <ActiveLoanCard key={l.id} loan={l} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing borrowed right now" />
          )}
          {d.waiting.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-[14px] font-semibold text-muted">Waiting for approval</h3>
              <div className="space-y-3">
                {d.waiting.map((l) => (
                  <SentRequestCard key={l.id} loan={l} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionTitle>Your items that are out</SectionTitle>
          {d.lentOut.length ? (
            <ul className="space-y-2">
              {d.lentOut.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/loans/${l.id}`}
                    className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 hover:border-ink/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-ink">{l.item.name}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {l.borrower.name} · due {formatDay(l.endDate)}
                      </span>
                    </span>
                    <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="None of your items are out" />
          )}
        </section>

        <section>
          <SectionTitle>Recent activity</SectionTitle>
          {d.activity.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
              {d.activity.map((a, i) => (
                <li key={`${a.loanId}-${i}`}>
                  <Link href={`/loans/${a.loanId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sunken">
                    <span className="min-w-0 text-[14px] text-ink">
                      <span className="block truncate">
                        {a.itemName}: <span className="font-medium">{STATUS_LABEL[a.toStatus]}</span>
                      </span>
                      <span className="block text-[12px] text-muted">
                        {a.actorIsMe ? "You" : a.actorName} · {formatRelative(a.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet" />
          )}
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle
          action={
            <Link href="/browse" className="text-[13px] font-semibold text-primary hover:underline">
              Browse all
            </Link>
          }
        >
          Recently listed
        </SectionTitle>
        {d.recentItems.length ? (
          <ItemGrid items={d.recentItems} />
        ) : (
          <EmptyState
            title="No items from other students yet"
            action={
              <LinkButton href="/items/new" size="md">
                List an item
              </LinkButton>
            }
          />
        )}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getUser, getUserStats } from "@/server/services/users";
import { listUserItems } from "@/server/services/items";
import { reviewsFor } from "@/server/services/reviews";
import { AppError } from "@/server/errors";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Stars } from "@/components/ui/stars";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ItemImage } from "@/components/ui/misc";
import { AVAILABILITY } from "@/components/items/item-card";
import { StatTile } from "@/components/profile/stat-tile";
import { CAMPUS_LABEL, UNIVERSITY } from "@/lib/site";

export const metadata: Metadata = { title: "Lender profile" };

/** Figma "Lender Profile". */
export default async function UserProfilePage({ params, searchParams }: PageProps<"/users/[id]">) {
  const viewer = await requireUser();
  const id = Number((await params).id);
  const { all } = await searchParams;
  let user;
  try {
    user = getUser(id);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }
  const stats = getUserStats(id);
  const items = listUserItems(id);
  const reviews = reviewsFor(id, 10);
  const shown = all ? items : items.slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader backHref="/browse" title={viewer.id === id ? "Your public profile" : "Lender Profile"} />
      <div className="flex items-center gap-5">
        <Avatar name={user.fullName} imageKey={user.avatarKey} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-[24px] font-semibold text-ink">{user.fullName}</h2>
          {user.major && <p className="text-[13px] text-muted">{user.major}</p>}
          <p className="text-[13px] text-muted">{CAMPUS_LABEL}</p>
          <Stars rating={stats.rating} count={stats.reviewCount} className="mt-1" />
        </div>
      </div>
      <div className="mt-3">
        {user.studentVerified ? (
          <Badge tone="success">Verified {UNIVERSITY.split(" ")[0]} student</Badge>
        ) : (
          <Badge tone="neutral">Student ID not yet verified</Badge>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile value={stats.itemsListed} label="Items listed" />
        <StatTile value={stats.timesLent} label="Times lent" />
        <StatTile
          value={stats.returnedOkRate === null ? "–" : `${Math.round(stats.returnedOkRate * 100)}%`}
          label="Returned OK"
        />
      </div>

      <section className="mt-6">
        <SectionTitle
          action={
            items.length > 3 && !all ? (
              <Link href={`/users/${id}?all=1`} className="text-[15px] text-primary underline underline-offset-2">
                See all {items.length}
              </Link>
            ) : undefined
          }
        >
          Listed items
        </SectionTitle>
        {items.length === 0 ? (
          <EmptyState title="No items listed right now" />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {shown.map((item) => {
              const a = AVAILABILITY[item.availability];
              return (
                <li key={item.id}>
                  <Link
                    href={`/items/${item.id}`}
                    className="flex items-center gap-4 rounded-[12px] border border-line bg-surface p-3 hover:border-ink/50"
                  >
                    <ItemImage imageKey={item.imageKey} alt={item.name} className="size-[52px] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{item.name}</p>
                      <p className="truncate text-[13px] text-muted">{item.pickupPoint}</p>
                    </div>
                    <Badge tone={a.tone}>{a.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <SectionTitle>Recent reviews</SectionTitle>
        {reviews.length === 0 ? (
          <EmptyState title="No reviews yet" body="Reviews appear after completed loans." />
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-[12px] border border-line bg-surface px-4 py-3">
                <p className="text-[14px] font-medium text-ink">{r.reviewerName}</p>
                <Stars rating={r.rating} showLabel={false} />
                {r.comment && <p className="mt-1 text-[13px] text-muted">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

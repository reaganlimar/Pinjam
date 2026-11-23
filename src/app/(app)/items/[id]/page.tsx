import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag, MessageSquare } from "lucide-react";
import { requireUser } from "@/server/session";
import { getItem } from "@/server/services/items";
import { openLoanForItem } from "@/server/services/loans";
import { hasReported } from "@/server/services/reports";
import { chatWithLenderAction } from "@/server/actions/items";
import { AppError } from "@/server/errors";
import { BackButton } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DetailRow, ItemImage } from "@/components/ui/misc";
import { LenderCard } from "@/components/items/lender-card";
import { AVAILABILITY } from "@/components/items/item-card";
import { RequestForm } from "./request-form";
import { OwnerControls } from "./owner-controls";
import { CONDITION_LABEL, formatDay, todayDateOnly } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/loan-status";
import { buttonClasses, LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Item" };

function loadItem(id: number) {
  try {
    return getItem(id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}

export default async function ItemPage({ params, searchParams }: PageProps<"/items/[id]">) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { saved } = await searchParams;
  const item = loadItem(id);
  const isOwner = item.owner.id === user.id;
  const openLoan = isOwner ? null : openLoanForItem(item.id, user.id);
  const a = AVAILABILITY[item.availability];
  const [cover, ...more] = item.images;

  return (
    <div className="pb-8 pt-6 md:pt-8">
      <BackButton href={isOwner ? "/me/items" : "/browse"} />
      {saved && (
        <p role="status" className="mt-4 rounded-[10px] bg-success-bg px-4 py-3 text-sm text-success">
          Listing saved.
        </p>
      )}

      <div className="mx-auto mt-4 grid max-w-2xl gap-6 lg:max-w-none lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-10">
        {/* Photos */}
        <div>
          <ItemImage imageKey={cover?.key ?? null} alt={item.name} className="aspect-[357/208] w-full rounded-[12px] lg:aspect-[4/3]" />
          {more.length > 0 && (
            <ul className="mt-3 grid grid-cols-4 gap-3">
              {more.map((img) => (
                <li key={img.id}>
                  <ItemImage imageKey={img.key} alt={item.name} className="aspect-square w-full" />
                </li>
              ))}
            </ul>
          )}
          {item.description && (
            <div className="mt-5 hidden lg:block">
              <h2 className="text-[15px] font-semibold text-ink">About this item</h2>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-muted">{item.description}</p>
            </div>
          )}
        </div>

        {/* Details + borrowing */}
        <div className="space-y-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[20px] font-semibold leading-snug text-ink">{item.name}</h1>
              <Badge tone={a.tone} className="mt-1">
                {a.label}
              </Badge>
            </div>
            <p className="text-[13px] text-muted">
              {item.categoryName} · Condition: {CONDITION_LABEL[item.condition]}
            </p>
          </div>
          <div className="-mt-1">
            <DetailRow label="Pickup point">{item.pickupPoint}</DetailRow>
            <DetailRow label="Maximum loan">
              {item.maxDays} day{item.maxDays === 1 ? "" : "s"}
            </DetailRow>
          </div>
          {item.description && (
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted lg:hidden">{item.description}</p>
          )}

          <LenderCard
            owner={item.owner}
            rating={item.ownerRating}
            reviewCount={item.ownerReviewCount}
            verified={item.ownerVerified}
            label={isOwner ? "Your listing" : "Lent by"}
          />

          {isOwner ? (
            <OwnerControls itemId={item.id} isAvailable={item.isAvailable} />
          ) : (
            <>
              <form action={chatWithLenderAction.bind(null, item.id, undefined)}>
                <button type="submit" className={buttonClasses("outline", "md", "h-[46px] w-full border-2 border-primary font-medium text-primary hover:bg-primary-soft")}>
                  <MessageSquare className="size-5" strokeWidth={1.8} />
                  Chat with lender about pickup time
                </button>
              </form>

              {item.reserved.length > 0 && (
                <div className="rounded-[10px] bg-warning-bg px-4 py-3 text-[13px] text-warning">
                  <p className="font-semibold">Already booked</p>
                  <ul className="mt-0.5">
                    {item.reserved.map((r) => (
                      <li key={`${r.start}-${r.end}`}>
                        {formatDay(r.start)} – {formatDay(r.end)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {openLoan ? (
                <div className="space-y-3 rounded-[12px] border border-line bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[15px] font-semibold text-ink">Your request</p>
                    <Badge tone={STATUS_TONE[openLoan.status]} size="md">
                      {STATUS_LABEL[openLoan.status]}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-muted">
                    Pick up {formatDay(openLoan.startDate)} · Return by {formatDay(openLoan.endDate)}
                  </p>
                  <LinkButton href={`/loans/${openLoan.id}`} variant="outline" size="md" className="w-full">
                    View request
                  </LinkButton>
                </div>
              ) : item.isAvailable ? (
                <RequestForm
                  itemId={item.id}
                  maxDays={item.maxDays}
                  pricePerDay={item.pricePerDay}
                  reserved={item.reserved}
                  today={todayDateOnly()}
                />
              ) : (
                <p className="rounded-[10px] bg-neutral-bg px-4 py-3 text-sm text-neutral">
                  The owner has paused this listing. Check back later.
                </p>
              )}

              <div className="pt-2 text-center">
                {hasReported(user.id, item.id) ? (
                  <p className="text-[13px] text-muted">You reported this listing.</p>
                ) : (
                  <Link
                    href={`/items/${item.id}/report`}
                    className="inline-flex items-center gap-1.5 text-[13px] text-muted underline-offset-2 hover:text-danger hover:underline"
                  >
                    <Flag className="size-3.5" /> Report this listing
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

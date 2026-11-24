import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { requireUser } from "@/server/session";
import { getLoanForUser } from "@/server/services/loans";
import { hasReviewed } from "@/server/services/reviews";
import { getUser, getUserStats } from "@/server/services/users";
import { chatWithLenderAction } from "@/server/actions/items";
import { AppError } from "@/server/errors";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ItemImage, SuccessHero } from "@/components/ui/misc";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { LenderCard } from "@/components/items/lender-card";
import { LoanActionForm } from "@/components/loans/loan-action-form";
import { ReviewForm } from "@/components/loans/review-form";
import { FeeReceivedButton } from "@/components/loans/fee-received-button";
import { formatDateTime, formatDay, formatRupiah, pluralDays, todayDateOnly } from "@/lib/format";
import { availableActions, RESERVING_STATUSES, STATUS_LABEL, STATUS_TONE, type LoanStatus } from "@/lib/loan-status";
import { can } from "@/lib/permissions";
import { VerificationRequired } from "@/components/verification/verification-required";

export const metadata: Metadata = { title: "Loan" };

const CONDITION_TEXT = { same: "Same as pickup", damaged: "Damaged", missing_parts: "Missing parts" } as const;
const PAYMENT_TEXT = { none: "Free", cash: "Cash at pickup", transfer: "Transfer / QRIS to lender" } as const;

/** What happens next, in plain words, for each side. */
function nextStepText(status: LoanStatus, role: "borrower" | "lender", lenderName: string, borrowerName: string) {
  const b = borrowerName.split(" ")[0];
  const l = lenderName.split(" ")[0];
  const text: Record<LoanStatus, [string, string]> = {
    pending: [`Waiting for ${l} to approve your request.`, `${b} wants to borrow this. Approve or decline.`],
    approved: [`Approved! ${l} will mark it ready for pickup.`, `Mark it ready when you can hand it over.`],
    ready_for_pickup: [
      `Ready for pickup. Tap Confirm received when you collect it.`,
      `Waiting for ${b} to collect it and confirm.`,
    ],
    borrowed: [`Enjoy! Tap Return when you've handed it back.`, `${b} has it. Confirm when it's back with you.`],
    return_pending: [`Waiting for ${l} to confirm they have it back.`, `${b} says it's returned. Confirm to finish.`],
    completed: ["This loan is complete.", "This loan is complete."],
    rejected: ["This request was declined.", "You declined this request."],
    cancelled: ["This request was cancelled.", "This request was cancelled."],
  };
  return text[status][role === "borrower" ? 0 : 1];
}

export default async function LoanPage({ params, searchParams }: PageProps<"/loans/[id]">) {
  const user = await requireUser();
  const id = Number((await params).id);
  const { done } = await searchParams;
  let data;
  try {
    data = await getLoanForUser(id, user.id);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }
  const { loan, role, events } = data;
  const other = role === "borrower" ? loan.lender : loan.borrower;
  const otherStats = await getUserStats(other.id);
  // Contact numbers are only shared once a loan is approved and still in progress.
  const otherPhone = (RESERVING_STATUSES as readonly string[]).includes(loan.status) ? (await getUser(other.id)).phone : null;
  // Approving needs a verified account (enforced in transitionLoan); other steps stay open.
  const approveBlocked = role === "lender" && !can(user, "approve_loan");
  const actions = availableActions(loan.status, role).filter((a) => !(a === "approve" && approveBlocked));
  const reviewed = loan.status === "completed" ? await hasReviewed(loan.id, user.id) : true;
  const returnedOnTime = loan.returnedAt ? loan.returnedAt.slice(0, 10) <= loan.endDate : null;
  const overdue = loan.status === "borrowed" && loan.endDate < todayDateOnly();
  // Figma confirmation screens: "Item received" right after pickup, "Item returned" once complete.
  const showReceived = done === "received" && loan.status === "borrowed";
  const showReturned = loan.status === "completed" && (done === "completed" || role === "borrower");

  return (
    <div className="mx-auto max-w-2xl pb-8">
      <PageHeader backHref={role === "borrower" ? "/loans" : "/requests"} title={showReceived || showReturned ? undefined : "Loan details"} />

      {showReceived && (
        <SuccessHero title="Item received" body="You confirmed the pickup. Take care of the item and return it on time." />
      )}
      {showReturned && (
        <SuccessHero
          title={role === "borrower" ? "Item returned" : "Return confirmed"}
          body={
            role === "borrower"
              ? "The owner confirmed they have the item back. Thank you!"
              : "Thanks for lending! The loan is now complete."
          }
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-[12px] border border-line bg-surface p-3">
          <ItemImage imageKey={loan.item.imageKey} alt={loan.item.name} className="size-[60px] shrink-0" />
          <div className="min-w-0 flex-1">
            {loan.item.deleted ? (
              <p className="text-[16px] font-semibold leading-snug text-ink">{loan.item.name}</p>
            ) : (
              <Link href={`/items/${loan.item.id}`} className="block text-[16px] font-semibold leading-snug text-ink hover:text-primary">
                {loan.item.name}
              </Link>
            )}
            <p className="text-[13px] text-muted">{loan.item.pickupPoint}</p>
          </div>
          <Badge tone={STATUS_TONE[loan.status]} size="md">
            {STATUS_LABEL[loan.status]}
          </Badge>
        </div>

        {overdue && (
          <p className="rounded-[10px] bg-danger-bg px-4 py-3 text-sm text-danger">
            This item was due {formatDay(loan.endDate)}. {role === "borrower" ? "Please return it as soon as you can." : ""}
          </p>
        )}
        {loan.status === "completed" && returnedOnTime !== null && (
          <p className="text-center">
            <Badge tone={returnedOnTime ? "success" : "warning"} size="md">
              {returnedOnTime ? "Returned on time" : "Returned late"}
            </Badge>
          </p>
        )}

        <p className="text-[15px] text-ink">{nextStepText(loan.status, role, loan.lender.name, loan.borrower.name)}</p>
        {showReceived && (
          <p className="rounded-[10px] bg-primary-soft px-4 py-3 text-[13px] text-primary">
            We will remind you the day before it&apos;s due.
          </p>
        )}

        {approveBlocked && loan.status === "pending" && <VerificationRequired actor={user} capability="approve_loan" />}
        <LoanActionForm loanId={loan.id} actions={actions} size="lg" />

        <dl className="grid grid-cols-2 gap-y-2.5 rounded-[12px] border border-line bg-surface p-4 text-[14px]">
          <dt className="text-muted">Pickup</dt>
          <dd className="text-right text-ink">
            {formatDay(loan.startDate)} · {loan.item.pickupPoint}
          </dd>
          <dt className="text-muted">Return by</dt>
          <dd className="text-right text-ink">{formatDay(loan.endDate)}</dd>
          <dt className="text-muted">Duration</dt>
          <dd className="text-right text-ink">{pluralDays(loan.days)}</dd>
          {loan.pickedUpAt && (
            <>
              <dt className="text-muted">Received on</dt>
              <dd className="text-right text-ink">{formatDateTime(loan.pickedUpAt)}</dd>
            </>
          )}
          {loan.returnedAt && (
            <>
              <dt className="text-muted">Returned</dt>
              <dd className="text-right text-ink">{formatDateTime(loan.returnedAt)}</dd>
            </>
          )}
          {loan.returnCondition && (
            <>
              <dt className="text-muted">Condition</dt>
              <dd className="text-right text-ink">{CONDITION_TEXT[loan.returnCondition]}</dd>
            </>
          )}
          <dt className="text-muted">Fee</dt>
          <dd className="text-right text-ink">
            {loan.feeTotal > 0 ? (
              <>
                <span className="font-semibold">{formatRupiah(loan.feeTotal)}</span>
                <span className="block text-[12px] text-muted">
                  {pluralDays(loan.days)} × {formatRupiah(loan.pricePerDay)} · {PAYMENT_TEXT[loan.paymentMethod]}
                </span>
              </>
            ) : (
              "Free"
            )}
          </dd>
          {loan.feeTotal > 0 && loan.status !== "cancelled" && loan.status !== "rejected" && (
            <>
              <dt className="text-muted">Payment</dt>
              <dd className="flex justify-end text-right text-ink">
                {loan.feeReceivedAt ? (
                  <Badge tone="success">Lender confirmed paid</Badge>
                ) : role === "lender" && ["ready_for_pickup", "borrowed", "return_pending", "completed"].includes(loan.status) ? (
                  <FeeReceivedButton loanId={loan.id} />
                ) : (
                  <span className="text-muted">Not recorded yet</span>
                )}
              </dd>
            </>
          )}
        </dl>
        {loan.note && (
          <p className="rounded-[12px] bg-sunken px-4 py-3 text-[14px] text-ink">
            <span className="block text-[12px] font-semibold text-muted">Note from {loan.borrower.name.split(" ")[0]}</span>
            {loan.note}
          </p>
        )}

        <LenderCard
          owner={other}
          rating={otherStats.rating}
          reviewCount={otherStats.reviewCount}
          label={role === "borrower" ? "Lent by" : "Borrowed by"}
        />
        {otherPhone && (
          <p className="rounded-[12px] bg-sunken px-4 py-3 text-[14px] text-ink">
            <span className="block text-[12px] font-semibold text-muted">{other.name.split(" ")[0]}&apos;s phone</span>
            <a href={`tel:${otherPhone.replace(/\s/g, "")}`} className="text-primary underline-offset-2 hover:underline">
              {otherPhone}
            </a>
          </p>
        )}
        {!loan.item.deleted && (
          <form action={chatWithLenderAction.bind(null, loan.item.id, role === "lender" ? loan.borrower.id : undefined)}>
            <button type="submit" className={buttonClasses("outline", "md", "h-[46px] w-full border-2 border-primary font-medium text-primary hover:bg-primary-soft")}>
              <MessageSquare className="size-5" strokeWidth={1.8} />
              Message {other.name.split(" ")[0]}
            </button>
          </form>
        )}

        {loan.status === "completed" &&
          (reviewed ? (
            <p className="rounded-[10px] bg-success-bg px-4 py-3 text-sm text-success">
              Thanks! You reviewed {other.name.split(" ")[0]} for this loan.
            </p>
          ) : (
            <ReviewForm loanId={loan.id} question={role === "borrower" ? "How was the lender?" : "How was the borrower?"} />
          ))}

        <section className="pt-2">
          <SectionTitle>History</SectionTitle>
          <ol className="relative space-y-3 border-l-2 border-line-soft pl-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-surface bg-primary" />
                <p className="text-[14px] text-ink">
                  <span className="font-medium">{STATUS_LABEL[e.toStatus]}</span>
                  {e.actorName && <span className="text-muted"> · {e.actorName}</span>}
                </p>
                <p className="text-[12px] text-muted">
                  {formatDateTime(e.createdAt)}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {loan.status === "completed" && role === "borrower" && (
          <div className="grid gap-3 pt-4 sm:grid-cols-2">
            <LinkButton href="/browse" variant="outline" className="w-full">
              Borrow something else
            </LinkButton>
            <LinkButton href="/loans" className="w-full">
              Done
            </LinkButton>
          </div>
        )}
      </div>
    </div>
  );
}

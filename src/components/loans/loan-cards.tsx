import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ItemImage } from "@/components/ui/misc";
import { LoanActionForm } from "./loan-action-form";
import { chatWithLenderAction } from "@/server/actions/items";
import { formatDay, formatRupiah, pluralDays } from "@/lib/format";
import { availableActions, STATUS_LABEL, STATUS_TONE, type LoanAction } from "@/lib/loan-status";
import type { LoanView } from "@/server/services/loans";

function feeLine(loan: LoanView) {
  return loan.feeTotal > 0 ? ` · ${formatRupiah(loan.feeTotal)}` : "";
}

/** Requests → Received card: "Allen wants Eraser" with Decline / Approve (Figma). */
export function ReceivedRequestCard({ loan }: { loan: LoanView }) {
  const actions = availableActions(loan.status, "lender").filter((a) => a !== "cancel");
  return (
    <article className="rounded-[12px] border border-line bg-surface p-3.5">
      <div className="flex items-start gap-3">
        <Link href={`/loans/${loan.id}`} className="min-w-0 flex-1 hover:underline-offset-2">
          <h3 className="text-[16px] font-semibold text-ink hover:text-primary">
            {loan.borrower.name.split(" ")[0]} wants {loan.item.name}
          </h3>
          <p className="text-[13px] text-muted">
            {pluralDays(loan.days)} · Pickup {formatDay(loan.startDate)} · {loan.item.pickupPoint}
            {feeLine(loan)}
          </p>
          {loan.note && <p className="mt-1 text-[13px] italic text-ink">“{loan.note}”</p>}
          {loan.status !== "pending" && (
            <Badge tone={STATUS_TONE[loan.status]} className="mt-1.5">
              {STATUS_LABEL[loan.status]}
            </Badge>
          )}
        </Link>
        <form action={chatWithLenderAction.bind(null, loan.item.id, loan.borrower.id)}>
          <button
            type="submit"
            aria-label={`Message ${loan.borrower.name}`}
            className="flex size-[50px] items-center justify-center rounded-[10px] border border-primary text-primary transition-colors hover:bg-primary-soft"
          >
            <MessageSquare className="size-6" strokeWidth={1.6} />
          </button>
        </form>
      </div>
      <LoanActionForm loanId={loan.id} actions={orderLenderActions(actions)} returnTo="/requests" className="mt-3" />
    </article>
  );
}

/** Decline before Approve, like the Figma buttons. */
function orderLenderActions(actions: LoanAction[]) {
  const order: LoanAction[] = ["reject", "approve", "mark_ready", "confirm_return"];
  return order.filter((a) => actions.includes(a));
}

/** Requests → Sent card with status pill (Figma). */
export function SentRequestCard({ loan }: { loan: LoanView }) {
  return (
    <article className="rounded-[12px] border border-line bg-surface p-3.5">
      <Link href={`/loans/${loan.id}`} className="block">
        <h3 className="text-[16px] font-semibold text-ink hover:text-primary">{loan.item.name}</h3>
        <p className="text-[13px] text-muted">
          {pluralDays(loan.days)} · Pickup {formatDay(loan.startDate)} · {loan.item.pickupPoint}
          {feeLine(loan)}
        </p>
        <p className="text-[13px] text-muted">Lent by {loan.lender.name}</p>
      </Link>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">Status</span>
        <Badge tone={STATUS_TONE[loan.status]} size="md" className="min-w-[120px] justify-center">
          {STATUS_LABEL[loan.status]}
        </Badge>
      </div>
      {availableActions(loan.status, "borrower").includes("cancel") && (
        <LoanActionForm loanId={loan.id} actions={["cancel"]} size="sm" returnTo="/requests?tab=sent" className="mt-3" />
      )}
    </article>
  );
}

/** My Loans → Active row: item, due date, and the next step (Confirm received / Return). */
export function ActiveLoanCard({ loan }: { loan: LoanView }) {
  const actions = availableActions(loan.status, "borrower").filter((a) => a !== "cancel");
  return (
    <article className="flex items-center gap-3 rounded-[12px] border border-line bg-surface p-3.5">
      <ItemImage imageKey={loan.item.imageKey} alt={loan.item.name} className="hidden size-[60px] shrink-0 sm:block" />
      <Link href={`/loans/${loan.id}`} className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold leading-snug text-ink hover:text-primary">{loan.item.name}</h3>
        <p className="truncate text-[13px] text-muted">
          {loan.status === "approved" || loan.status === "ready_for_pickup"
            ? `Pickup ${formatDay(loan.startDate)} · ${loan.item.pickupPoint}`
            : `Due ${formatDay(loan.endDate)} · ${loan.item.pickupPoint}`}
        </p>
        {loan.status === "approved" && <p className="text-[12px] text-muted">Waiting for the lender to get it ready</p>}
      </Link>
      <div className="shrink-0">
        {actions.length ? (
          <LoanActionForm loanId={loan.id} actions={actions} size="sm" returnTo="/loans" />
        ) : (
          <Badge tone={STATUS_TONE[loan.status]} size="md" className="w-full justify-center">
            {loan.status === "return_pending" ? "Returned" : STATUS_LABEL[loan.status]}
          </Badge>
        )}
      </div>
    </article>
  );
}

/** History row for a closed loan on either side. */
export function HistoryLoanCard({ loan, viewerId }: { loan: LoanView; viewerId: number }) {
  const borrowed = loan.borrower.id === viewerId;
  return (
    <Link
      href={`/loans/${loan.id}`}
      className="flex items-center gap-3 rounded-[12px] border border-line bg-surface p-3 hover:border-ink/50"
    >
      <ItemImage imageKey={loan.item.imageKey} alt={loan.item.name} className="size-[52px] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{loan.item.name}</p>
        <p className="truncate text-[13px] text-muted">
          {borrowed ? `Borrowed from ${loan.lender.name}` : `Lent to ${loan.borrower.name}`} · {formatDay(loan.startDate)} –{" "}
          {formatDay(loan.endDate)}
        </p>
      </div>
      <Badge tone={STATUS_TONE[loan.status]}>{STATUS_LABEL[loan.status]}</Badge>
    </Link>
  );
}

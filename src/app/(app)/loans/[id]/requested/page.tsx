import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getLoanForUser } from "@/server/services/loans";
import { AppError } from "@/server/errors";
import { SuccessHero } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { formatDay, formatRupiah, pluralDays } from "@/lib/format";

export const metadata: Metadata = { title: "Request sent" };

/** Figma "Request received" confirmation. */
export default async function RequestedPage({ params }: PageProps<"/loans/[id]/requested">) {
  const user = await requireUser();
  let data;
  try {
    data = await getLoanForUser(Number((await params).id), user.id);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }
  const { loan } = data;
  return (
    <div className="mx-auto flex min-h-[75dvh] max-w-md flex-col">
      <SuccessHero title="Request received" body="We will let the lender know you have requested their item." />
      <dl className="grid grid-cols-2 gap-y-2 rounded-[12px] border border-line bg-surface p-4 text-[14px]">
        <dt className="text-muted">Item</dt>
        <dd className="text-right font-medium text-ink">{loan.item.name}</dd>
        <dt className="text-muted">Duration</dt>
        <dd className="text-right text-ink">{pluralDays(loan.days)}</dd>
        <dt className="text-muted">Pickup</dt>
        <dd className="text-right text-ink">
          {formatDay(loan.startDate)} · {loan.item.pickupPoint}
        </dd>
        <dt className="text-muted">Return by</dt>
        <dd className="text-right text-ink">{formatDay(loan.endDate)}</dd>
        {loan.feeTotal > 0 && (
          <>
            <dt className="text-muted">Fee (pay lender)</dt>
            <dd className="text-right font-semibold text-ink">{formatRupiah(loan.feeTotal)}</dd>
          </>
        )}
      </dl>
      <div className="mt-auto space-y-3 pt-8">
        <LinkButton href="/requests?tab=sent" variant="outline" className="w-full">
          View my requests
        </LinkButton>
        <LinkButton href="/browse" className="w-full">
          Return
        </LinkButton>
      </div>
    </div>
  );
}

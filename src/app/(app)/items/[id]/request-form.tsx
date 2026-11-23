"use client";

import { useActionState, useMemo, useState } from "react";
import { requestLoanAction } from "@/server/actions/loans";
import { FormMessage, Input, inputClasses, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { addDays, formatDay, formatPriceShort, formatRupiah, pluralDays } from "@/lib/format";
import { cn } from "@/lib/cn";

const MAX_DAYS_AHEAD = 60;

/** "Borrow for [Select day(s)]  Pick up Thu 8 Oct · Return by Sat 10 Oct" + request button. */
export function RequestForm({
  itemId,
  maxDays,
  pricePerDay,
  reserved,
  today,
}: {
  itemId: number;
  maxDays: number;
  pricePerDay: number;
  reserved: { start: string; end: string }[];
  today: string;
}) {
  const [state, action] = useActionState(requestLoanAction.bind(null, itemId), {});
  const [startDate, setStartDate] = useState(state.values?.startDate ?? today);
  const [days, setDays] = useState(Number(state.values?.days ?? 0));
  const [payment, setPayment] = useState(state.values?.paymentMethod ?? "cash");
  const err = state.fieldErrors ?? {};

  const endDate = days ? addDays(startDate, days) : null;
  const total = pricePerDay * days;
  const clash = useMemo(
    () => (endDate ? reserved.find((r) => startDate < r.end && r.start < endDate) : undefined),
    [reserved, startDate, endDate],
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="days" className="text-[17px] font-semibold text-ink">
          Borrow for
        </label>
        <div className="relative w-[160px]">
          <select
            id="days"
            name="days"
            value={days || ""}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-invalid={err.days ? true : undefined}
            className={cn(inputClasses, "h-[38px] appearance-none rounded-[8px] border-line-soft pl-4 pr-9 text-[15px]", !days && "text-muted")}
          >
            <option value="" disabled>
              Select day(s)
            </option>
            {Array.from({ length: maxDays }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {pluralDays(n)}
              </option>
            ))}
          </select>
          <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
      {err.days && <p className="-mt-2 text-right text-[13px] text-danger">{err.days}</p>}

      <div className="flex items-center justify-between gap-4">
        <label htmlFor="startDate" className="whitespace-nowrap text-[14px] text-muted">
          Pickup date
        </label>
        <Input
          name="startDate"
          type="date"
          min={today}
          max={addDays(today, MAX_DAYS_AHEAD)}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value || today)}
          error={err.startDate}
          className="h-[38px] w-[160px] rounded-[8px] border-line-soft px-3 text-[14px]"
        />
      </div>
      {err.startDate && <p className="-mt-2 text-right text-[13px] text-danger">{err.startDate}</p>}

      <p className="text-[13px] text-muted" aria-live="polite">
        {endDate
          ? `Pick up ${formatDay(startDate)} · Return by ${formatDay(endDate)}`
          : `Pick up ${formatDay(startDate)} · choose how many days`}
      </p>
      {clash && (
        <p className="rounded-[10px] bg-warning-bg px-3 py-2 text-[13px] text-warning">
          These dates overlap a booking ({formatDay(clash.start)} – {formatDay(clash.end)}). Pick other dates.
        </p>
      )}

      {pricePerDay > 0 && (
        <fieldset className="space-y-3 rounded-[12px] border border-line bg-surface p-4">
          <legend className="sr-only">Fee</legend>
          <div className="flex justify-between text-[14px] text-ink">
            <span>
              {days ? `${pluralDays(days)} × ${formatRupiah(pricePerDay)}` : `${formatRupiah(pricePerDay)} per day`}
            </span>
            <span className="font-semibold">{days ? formatRupiah(total) : "—"}</span>
          </div>
          <p className="text-[12px] text-muted">
            Paid directly to the lender at pickup. Pinjam doesn&apos;t handle payments.
          </p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How you'll pay">
            {(
              [
                ["cash", "Cash at pickup"],
                ["transfer", "Transfer / QRIS"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center rounded-[10px] border text-[13px] font-medium transition-colors",
                  payment === value ? "border-primary bg-primary-soft text-primary" : "border-line text-ink hover:bg-sunken",
                )}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={value}
                  checked={payment === value}
                  onChange={() => setPayment(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          {err.paymentMethod && <p className="text-[13px] text-danger">{err.paymentMethod}</p>}
        </fieldset>
      )}

      <details className="group">
        <summary className="cursor-pointer text-[13px] font-medium text-primary">Add a note for the lender</summary>
        <Textarea name="note" maxLength={300} placeholder="e.g. I need it for my Calculus exam on Friday" className="mt-2 min-h-20" defaultValue={state.values?.note} />
      </details>

      <FormMessage error={state.error} />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg px-6 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0">
        <SubmitButton className="w-full" disabled={!days || Boolean(clash)} pendingLabel="Sending request…">
          {pricePerDay > 0 ? `Request for ${formatPriceShort(days ? total : pricePerDay)}` : "Request to borrow"}
        </SubmitButton>
      </div>
      <div className="h-16 md:hidden" aria-hidden />
    </form>
  );
}

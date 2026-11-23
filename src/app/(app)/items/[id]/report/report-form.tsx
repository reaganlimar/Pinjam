"use client";

import { useActionState } from "react";
import { reportItemAction } from "@/server/actions/items";
import { Field, FormMessage, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { LinkButton } from "@/components/ui/button";

export function ReportForm({ itemId, reasons }: { itemId: number; reasons: { value: string; label: string }[] }) {
  const [state, action] = useActionState(reportItemAction.bind(null, itemId), {});
  const err = state.fieldErrors ?? {};
  if (state.success) {
    return (
      <div className="space-y-6">
        <FormMessage success={state.success} />
        <LinkButton href="/browse" variant="outline" className="w-full">
          Back to browse
        </LinkButton>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink">What&apos;s wrong?</legend>
        <div className="space-y-2">
          {reasons.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 text-[14px] text-ink has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="radio" name="reason" value={r.value} defaultChecked={state.values?.reason === r.value} className="size-4 accent-[var(--primary)]" />
              {r.label}
            </label>
          ))}
        </div>
        {err.reason && <p className="mt-2 text-[13px] text-danger">{err.reason}</p>}
      </fieldset>
      <Field label="Details (optional)" name="details" error={err.details}>
        <Textarea name="details" maxLength={1000} defaultValue={state.values?.details} placeholder="Anything that helps us understand the problem" />
      </Field>
      <p className="text-[13px] text-muted">
        Reports are private. The lister isn&apos;t told who reported them.
      </p>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send report
      </SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { submitVerificationAction } from "@/server/actions/verification";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox } from "@/components/ui/checkbox";

export function VerificationForm({
  defaults,
  retentionDays,
  resubmitting,
}: {
  defaults: { fullName: string; studentNumber: string; university: string };
  retentionDays: number;
  resubmitting: boolean;
}) {
  const [state, action] = useActionState(submitVerificationAction, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink">Photo of your student ID</p>
        <PhotoInput name="idPhoto" label="Add a clear photo of the front of your card" error={err.idPhoto} />
        <p className="mt-2 text-[12px] text-muted">
          Lay the card flat in good light, fill the frame, and make sure your name and number are sharp. JPG, PNG or WebP.
        </p>
      </div>
      <Field label="Full name (as printed on the card)" name="fullName" error={err.fullName}>
        <Input name="fullName" autoComplete="name" defaultValue={v.fullName ?? defaults.fullName} error={err.fullName} />
      </Field>
      <Field label="Student ID number" name="studentNumber" error={err.studentNumber}>
        <Input
          name="studentNumber"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={v.studentNumber ?? defaults.studentNumber}
          error={err.studentNumber}
        />
      </Field>
      <Field label="University" name="university" error={err.university}>
        <Input name="university" autoComplete="organization" defaultValue={v.university ?? defaults.university} error={err.university} />
      </Field>
      <Checkbox name="consent" defaultChecked={v.consent === "on"} error={err.consent}>
        This is my own student ID. I agree that Pinjam admins may view it to verify me. The photo is deleted{" "}
        {retentionDays === 0 ? "as soon as it's reviewed" : `${retentionDays} day${retentionDays === 1 ? "" : "s"} after review`}.
      </Checkbox>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Submitting…">
        {resubmitting ? "Submit again" : "Submit for verification"}
      </SubmitButton>
    </form>
  );
}

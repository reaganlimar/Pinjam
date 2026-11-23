"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/server/actions/account";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field label="Current password" name="currentPassword" error={err.currentPassword}>
        <Input name="currentPassword" type="password" autoComplete="current-password" error={err.currentPassword} />
      </Field>
      <Field label="New password" name="newPassword" error={err.newPassword}>
        <Input name="newPassword" type="password" autoComplete="new-password" placeholder="At least 8 characters" error={err.newPassword} />
      </Field>
      <Field label="Confirm new password" name="confirmPassword" error={err.confirmPassword}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" error={err.confirmPassword} />
      </Field>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Change password
      </SubmitButton>
    </form>
  );
}

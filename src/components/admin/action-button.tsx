"use client";

import { useActionState, useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/field";
import { ConfirmDialog } from "./confirm-dialog";
import type { FormState } from "@/server/actions/result";

/** A one-click admin server action, optionally behind a confirmation dialog. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "outline",
  confirm,
  className,
}: {
  action: (prev: FormState) => Promise<FormState>;
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  confirm?: { title: string; body: string; confirmLabel: string };
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [open, setOpen] = useState(false);
  return (
    <form action={formAction} className={className}>
      {confirm ? (
        <>
          <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
            {label}
          </Button>
          <ConfirmDialog open={open} onClose={() => setOpen(false)} title={confirm.title}>
            <p className="text-[14px] text-muted">{confirm.body}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="md" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton variant={variant === "danger" ? "danger" : "primary"} size="md" pendingLabel={pendingLabel}>
                {confirm.confirmLabel}
              </SubmitButton>
            </div>
          </ConfirmDialog>
        </>
      ) : (
        <SubmitButton variant={variant} size="sm" pendingLabel={pendingLabel}>
          {label}
        </SubmitButton>
      )}
      {(state.error || state.success) && (
        <div className="mt-2">
          <FormMessage error={state.error} success={state.success} />
        </div>
      )}
    </form>
  );
}

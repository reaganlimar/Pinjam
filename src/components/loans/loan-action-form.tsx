"use client";

import { useActionState, useState } from "react";
import { loanTransitionAction } from "@/server/actions/loans";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { ACTION_LABEL, type LoanAction } from "@/lib/loan-status";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const VARIANT: Record<LoanAction, ButtonVariant> = {
  approve: "primary",
  reject: "outline",
  cancel: "danger",
  mark_ready: "primary",
  confirm_pickup: "primary",
  mark_returned: "primary",
  confirm_return: "primary",
};

const CONFIRM: Partial<Record<LoanAction, string>> = {
  cancel: "Cancel this request? The other student will be notified.",
};

/**
 * One or more loan action buttons (Approve / Decline / Confirm received / Return…),
 * submitted to the validated status machine on the server.
 */
export function LoanActionForm({
  loanId,
  actions,
  size = "md",
  returnTo,
  className,
  labels,
}: {
  loanId: number;
  actions: LoanAction[];
  size?: ButtonSize;
  returnTo?: string;
  className?: string;
  labels?: Partial<Record<LoanAction, string>>;
}) {
  const [state, formAction] = useActionState(loanTransitionAction.bind(null, loanId), {});
  const [confirming, setConfirming] = useState<LoanAction | null>(null);
  const [condition, setCondition] = useState("same");
  if (actions.length === 0) return null;

  const needsDetails = (a: LoanAction) => a === "confirm_return" || Boolean(CONFIRM[a]);

  return (
    <form action={formAction} className={cn("space-y-2", className)}>
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {confirming ? (
        <div className="space-y-3 rounded-[10px] bg-sunken p-3">
          {confirming === "confirm_return" ? (
            <label className="block text-[13px] text-ink">
              <span className="mb-1.5 block font-semibold">Condition on return</span>
              <select
                name="returnCondition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="h-10 w-full rounded-[8px] border border-line bg-surface px-3 text-[14px]"
              >
                <option value="same">Same as pickup</option>
                <option value="damaged">Damaged</option>
                <option value="missing_parts">Missing parts</option>
              </select>
            </label>
          ) : (
            <p className="text-[13px] text-ink">{CONFIRM[confirming]}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size={size} onClick={() => setConfirming(null)}>
              Back
            </Button>
            <SubmitButton name="action" value={confirming} size={size} variant={confirming === "cancel" ? "danger" : "primary"}>
              {confirming === "cancel" ? "Yes, cancel" : "Confirm"}
            </SubmitButton>
          </div>
        </div>
      ) : (
        <div className={cn("grid gap-2", actions.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {actions.map((a) =>
            needsDetails(a) ? (
              <Button key={a} variant={VARIANT[a]} size={size} onClick={() => setConfirming(a)}>
                {labels?.[a] ?? ACTION_LABEL[a]}
              </Button>
            ) : (
              <SubmitButton key={a} name="action" value={a} variant={VARIANT[a]} size={size}>
                {labels?.[a] ?? ACTION_LABEL[a]}
              </SubmitButton>
            ),
          )}
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

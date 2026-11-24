"use client";

import { useActionState, useState } from "react";
import { decideVerificationAction } from "@/server/actions/admin";
import { Field, FormMessage, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmDialog } from "./confirm-dialog";
import type { Decision } from "@/lib/verification";

const COPY: Record<Decision, { button: string; title: string; body: string; confirm: string; reasonLabel?: string }> = {
  approve: {
    button: "Approve",
    title: "Approve this student?",
    body: "They'll be able to borrow, list items and approve requests. Only approve if the photo clearly shows a genuine card with these details.",
    confirm: "Yes, approve",
  },
  request_resubmission: {
    button: "Request resubmission",
    title: "Ask for a new submission?",
    body: "Use this when the photo is unclear or details are missing. The student sees your message and can submit again.",
    confirm: "Send request",
    reasonLabel: "What should the student fix? (shown to them)",
  },
  reject: {
    button: "Reject",
    title: "Reject this submission?",
    body: "Use this when the card isn't valid or doesn't match. The student sees your reason and can submit again.",
    confirm: "Yes, reject",
    reasonLabel: "Reason for rejecting (shown to the student)",
  },
};

/** Approve / Request resubmission / Reject, each behind a confirmation dialog. */
export function DecisionPanel({ submissionId, studentName }: { submissionId: number; studentName: string }) {
  const [state, action] = useActionState(decideVerificationAction.bind(null, submissionId), {});
  const [decision, setDecision] = useState<Decision | null>(
    state.values?.decision ? (state.values.decision as Decision) : null,
  );
  const err = state.fieldErrors ?? {};
  const copy = decision ? COPY[decision] : null;

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Internal note (optional)"
        name="notes"
        hint="Only admins see this. It's saved with the decision."
        error={err.notes}
      >
        <Textarea name="notes" maxLength={1000} className="min-h-20" defaultValue={state.values?.notes} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="primary" size="md" onClick={() => setDecision("approve")}>
          {COPY.approve.button}
        </Button>
        <Button variant="outline" size="md" onClick={() => setDecision("request_resubmission")}>
          {COPY.request_resubmission.button}
        </Button>
        <Button variant="danger" size="md" onClick={() => setDecision("reject")}>
          {COPY.reject.button}
        </Button>
      </div>
      {!decision && <FormMessage error={state.error} />}

      <ConfirmDialog open={decision !== null} onClose={() => setDecision(null)} title={copy?.title ?? ""}>
        <input type="hidden" name="decision" value={decision ?? ""} />
        <p className="text-[14px] text-muted">
          <span className="font-semibold text-ink">{studentName}.</span> {copy?.body}
        </p>
        {copy?.reasonLabel && (
          <Field label={copy.reasonLabel} name="reason" error={err.reason}>
            <Textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              autoFocus
              className="min-h-24"
              defaultValue={state.values?.reason}
              error={err.reason}
            />
          </Field>
        )}
        <FormMessage error={decision ? state.error : undefined} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="md" onClick={() => setDecision(null)}>
            Cancel
          </Button>
          <SubmitButton variant={decision === "reject" ? "danger" : "primary"} size="md" pendingLabel="Saving…">
            {copy?.confirm}
          </SubmitButton>
        </div>
      </ConfirmDialog>
    </form>
  );
}

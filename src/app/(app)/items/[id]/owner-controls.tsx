"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteItemAction, setAvailabilityAction } from "@/server/actions/items";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Toggle } from "@/components/ui/toggle";
import type { FormState } from "@/server/actions/result";

/** Edit / pause / delete controls shown to the item's owner. */
export function OwnerControls({ itemId, isAvailable }: { itemId: number; isAvailable: boolean }) {
  const [available, setAvailable] = useState(isAvailable);
  const [toggleState, setToggleState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [deleteState, deleteAction] = useActionState(deleteItemAction.bind(null, itemId), {});

  return (
    <div className="space-y-4 rounded-[12px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-ink">Available to borrow</p>
          <p className="text-[13px] text-muted">
            {available ? "Students can find and request this item." : "Hidden from Browse. No new requests."}
          </p>
        </div>
        <Toggle
          label="Available to borrow"
          checked={available}
          disabled={pending}
          onChange={(next) => {
            setAvailable(next);
            startTransition(async () => {
              const res = await setAvailabilityAction(itemId, next);
              setToggleState(res);
              if (res.error) setAvailable(!next);
            });
          }}
        />
      </div>
      <FormMessage error={toggleState.error} />
      <div className="grid grid-cols-2 gap-3">
        <LinkButton href={`/items/${itemId}/edit`} variant="outline" size="md">
          <Pencil className="size-4" /> Edit
        </LinkButton>
        <Button variant="danger" size="md" onClick={() => setConfirming(true)}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
      {confirming && (
        <form action={deleteAction} className="space-y-3 rounded-[10px] bg-danger-bg p-4" role="alertdialog" aria-label="Confirm delete">
          <p className="text-sm text-danger">
            Delete this listing? Pending requests will be declined. Past loans stay in everyone&apos;s history.
          </p>
          <FormMessage error={deleteState.error} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="md" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <SubmitButton variant="primary" size="md" className="bg-danger hover:bg-danger/90 active:bg-danger" pendingLabel="Deleting…">
              Delete
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

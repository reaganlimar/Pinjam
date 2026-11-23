"use client";

import { useState, useTransition } from "react";
import { markFeeReceivedAction } from "@/server/actions/loans";
import { Button } from "@/components/ui/button";

export function FeeReceivedButton({ loanId }: { loanId: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await markFeeReceivedAction(loanId);
            setError(res.error ?? null);
          })
        }
      >
        {pending ? "Saving…" : "I've been paid"}
      </Button>
      {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
